/* ============================================================================
   validar_fechas.sql
   Salud de la dimensión fecha en el DESTINO:
     - rango cubierto (min / max),
     - filas con FECHA_GESTION nula,
     - filas con fecha futura (anomalía),
     - cobertura día a día de los últimos 35 días (para detectar días faltantes).
   Ejecutar EN la base BD_MCOB_REPORTING.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

/* Rango y anomalías */
SELECT
    MIN(FECHA_GESTION)                                              AS FECHA_MIN,
    MAX(FECHA_GESTION)                                              AS FECHA_MAX,
    COUNT(1)                                                        AS TOTAL_FILAS,
    SUM(CASE WHEN FECHA_GESTION IS NULL THEN 1 ELSE 0 END)         AS FILAS_FECHA_NULA,
    SUM(CASE WHEN FECHA_GESTION > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS FILAS_FECHA_FUTURA
FROM REPORTE.TBL_GESTIONES;

/* Cobertura diaria de los últimos 35 días: días con 0 filas saltan a la vista */
;WITH CAL AS (
    SELECT CAST(DATEADD(DAY, -34, GETDATE()) AS DATE) AS DIA
    UNION ALL
    SELECT DATEADD(DAY, 1, DIA) FROM CAL
    WHERE DIA < CAST(GETDATE() AS DATE)
)
SELECT CAL.DIA,
       COUNT(G.CODIGO) AS FILAS,
       CASE WHEN COUNT(G.CODIGO) = 0 THEN '<-- SIN DATOS' ELSE '' END AS ALERTA
FROM CAL
LEFT JOIN REPORTE.TBL_GESTIONES G ON G.FECHA_GESTION = CAL.DIA
GROUP BY CAL.DIA
ORDER BY CAL.DIA;
GO
