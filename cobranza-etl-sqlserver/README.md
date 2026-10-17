# Cobranza ETL — Gestiones (SQL Server)

ETL diario de gestiones de cobranza para ContactoEficaz. Separa el **reporting**
de la base **transaccional** y carga de forma **incremental** (solo la data del
día anterior, acumulando) en lugar del antiguo `DROP/TRUNCATE` + recarga total.

## Arquitectura

```
ORIGEN (transaccional, solo lectura)        DESTINO (reporting, acumulativo)
┌───────────────────────────┐               ┌──────────────────────────────────┐
│ BD_MCOB                    │   ETL diario  │ BD_MCOB_REPORTING                 │
│   CALL / CARGA /           │ ───────────▶  │   REPORTE.TBL_GESTIONES (1 tabla) │
│   CONFIGURACION /          │   incremental │   REPORTE.VW_GESTIONES_MENSUAL    │
│   ADMINISTRACION           │   (ayer)      │                                   │
│ BD_MSEG (usuarios)         │               │   STG.TBL_GESTIONES_STG (staging) │
└───────────────────────────┘               │   ETL.SP_* / ETL.TBL_PROCESO_LOG  │
                                             └──────────────────────────────────┘
```

- **1 sola tabla de hechos** `REPORTE.TBL_GESTIONES` que crece día a día: cada
  corrida diaria carga **solo el día anterior**.
- **Consumo: `REPORTE.VW_GESTIONES_MENSUAL`** = mes calendario de **ayer**. El día 1
  sigue mostrando el mes recién cerrado (completo) en vez de un mes vacío.
- `VW_GESTIONES_3_MESES` está **deshabilitada** (comentada en `06_create_views.sql`).
- **Carga idempotente por día**: el SP aterriza el rango en `STG`, luego en una
  transacción corta hace `DELETE` del rango en destino + `INSERT` desde `STG`.
  Re-ejecutar el mismo día deja el mismo resultado.
- **Filtros SARGABLES**: `FEC_GEST_DT >= @inicio AND FEC_GEST_DT < @fin`
  (sin `YEAR()`/`MONTH()`).
- **Sin `DROP TABLE` diario**: las tablas se crean una sola vez (scripts idempotentes).
- **Dedup del origen**: lo hacen los procesos **WOLKVOX** e **IPBUSINESS** ANTES de este ETL. El ETL
  diario NO deduplica. `ETL.SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS` queda solo como
  utilitario opcional para la carga histórica inicial.

## Estructura

```
cobranza-etl-sqlserver/
├── sql/
│   ├── 00_create_database_reporting.sql   # crea BD_MCOB_REPORTING (recovery SIMPLE)
│   ├── 01_create_schemas.sql              # REPORTE / STG / ETL
│   ├── 02_create_tables_reporte.sql       # REPORTE.TBL_GESTIONES (acumulativa)
│   ├── 03_create_tables_staging.sql       # STG.TBL_GESTIONES_STG
│   ├── 04_create_log_table.sql            # ETL.TBL_PROCESO_LOG
│   ├── 05_create_indexes.sql              # índices de la tabla de hechos
│   └── 06_create_views.sql               # VW_GESTIONES_MENSUAL (_3_MESES comentada)
├── procedures/
│   ├── ETL.SP_PROCESAR_GESTIONES.sql              # carga incremental por rango
│   ├── ETL.SP_RECARGAR_GESTIONES_RANGO.sql        # backfill día por día
│   └── ETL.SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS.sql # dedup origen (opcional)
├── jobs/
│   └── SQL_AGENT_JOB_PROCESO_DIARIO_GESTIONES.sql # alternativa a Node
├── tests/
│   ├── validar_conteos.sql
│   ├── validar_duplicados.sql
│   └── validar_fechas.sql
└── README.md
```

## Instalación (una sola vez)

Ejecutar en orden (SSMS o `sqlcmd`). Los scripts son idempotentes.

```
sql/00_create_database_reporting.sql      -- requiere permiso CREATE DATABASE
sql/01_create_schemas.sql
sql/02_create_tables_reporte.sql
sql/03_create_tables_staging.sql
sql/04_create_log_table.sql
sql/05_create_indexes.sql
sql/06_create_views.sql
procedures/ETL.SP_PROCESAR_GESTIONES.sql
procedures/ETL.SP_RECARGAR_GESTIONES_RANGO.sql
procedures/ETL.SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS.sql
```

> **Nombres de BD**: los scripts usan `BD_MCOB` (origen), `BD_MSEG` (usuarios) y
> `BD_MCOB_REPORTING` (destino). Si cambian, reemplazar esos literales.

## Carga inicial (histórica)

Para poblar la primera vez, al menos desde el 1 del mes en curso (para que
`VW_GESTIONES_MENSUAL` quede completa):

```sql
USE BD_MCOB_REPORTING;
EXEC ETL.SP_RECARGAR_GESTIONES_RANGO
     @FECHA_INICIO = '2026-10-01';   -- @FECHA_FIN NULL => hasta AYER inclusive
```

(Opcional, solo histórico) dedup del origen antes del backfill:

```sql
EXEC ETL.SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS @FECHA_INICIO = '2026-10-01';
```

## Ejecución diaria

Orquestada por el panel **kubot** (Node). El script
`src/clientes/contactoeficaz/reporte/gestiones.js` invoca `ETL.SP_PROCESAR_GESTIONES`,
registra estado/historial y notifica por correo, igual que Wolkvox/IPBusiness.

```
npm run reporte:gestiones
```

- Variables en `.env` (sección *Reporte Gestiones — ETL*): `REPORTING_DB_*`,
  `REPORTE_GESTIONES_DIAS_ATRAS`, `REPORTE_GESTIONES_SCHEDULE_TIME`.
- **Horario recomendado: 08:00**, después del reintento de Wolkvox de las 7am; a esa
  hora el día anterior ya está completo y deduplicado (Wolkvox + IPBusiness).
- `REPORTE_GESTIONES_DIAS_ATRAS=1` carga **solo ayer** (nunca hoy). `N` = últimos N
  días hasta ayer, para recapturar tardíos; la carga es idempotente, no duplica.

Alternativa sin Node: `jobs/SQL_AGENT_JOB_PROCESO_DIARIO_GESTIONES.sql`.

## Validación

Tras una corrida, ejecutar en `BD_MCOB_REPORTING`:

- `tests/validar_conteos.sql` — origen vs destino por día (deben cuadrar).
- `tests/validar_duplicados.sql` — claves repetidas en destino (deben ser 0).
- `tests/validar_fechas.sql` — rango, nulos, fechas futuras y días sin datos.

Auditoría de cada ejecución:

```sql
SELECT TOP 20 * FROM ETL.TBL_PROCESO_LOG ORDER BY ID_LOG DESC;
```
