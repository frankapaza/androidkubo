/* ============================================================================
   06_create_views.sql
   Vistas de consumo derivadas de la tabla acumulativa REPORTE.TBL_GESTIONES.
   Reemplaza a la antigua tabla física TBL_GESTIONES_MENSUAL: ya no se recarga
   una tabla, se filtra la única tabla de hechos.
   Idempotente (CREATE OR ALTER). Ejecutar EN la base BD_MCOB_REPORTING.

   Si algún reporte/Power BI apuntaba al nombre antiguo, basta repuntarlo
   a esta vista (mismas columnas de negocio).
============================================================================ */
USE BD_MCOB_REPORTING;
GO

/* Mes calendario de AYER. La carga diaria trae solo el día anterior, así que
   el día 1 la vista sigue mostrando el mes que acaba de cerrar (completo) en vez
   de un mes nuevo vacío; desde el día 2 muestra el mes en curso. */
CREATE OR ALTER VIEW REPORTE.VW_GESTIONES_MENSUAL
AS
    SELECT *
    FROM REPORTE.TBL_GESTIONES
    WHERE FECHA_GESTION >= DATEFROMPARTS(YEAR(DATEADD(DAY, -1, CAST(GETDATE() AS DATE))),
                                         MONTH(DATEADD(DAY, -1, CAST(GETDATE() AS DATE))), 1)
      AND FECHA_GESTION <  DATEADD(MONTH, 1,
                             DATEFROMPARTS(YEAR(DATEADD(DAY, -1, CAST(GETDATE() AS DATE))),
                                           MONTH(DATEADD(DAY, -1, CAST(GETDATE() AS DATE))), 1));
GO

-- ─── DESHABILITADO: por ahora solo se usa VW_GESTIONES_MENSUAL ──────────────
-- Comentado con "--" (no con /* */) porque SSMS/sqlcmd parten el lote en GO
-- aunque esté dentro de un comentario de bloque.
--
-- /* Últimos 3 meses: desde el primer día del mes hace 3 meses (mismo criterio
--    que el script original de TBL_GESTIONES_3_MESES). */
-- CREATE OR ALTER VIEW REPORTE.VW_GESTIONES_3_MESES
-- AS
--     SELECT *
--     FROM REPORTE.TBL_GESTIONES
--     WHERE FECHA_GESTION >= DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()) - 3, 0);
-- GO
