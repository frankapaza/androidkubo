/* ============================================================================
   validar_duplicados.sql
   Detecta filas repetidas en el DESTINO por clave de negocio (CODIGO_TIPO + CODIGO).
   El INSERT no debería generar duplicados; si aparecen, suele indicar una doble
   ejecución sin el DELETE previo o duplicados ya presentes en el origen.
   Ejecutar EN la base BD_MCOB_REPORTING.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

/* Resumen: ¿cuántas claves están repetidas? */
SELECT COUNT(1) AS CLAVES_DUPLICADAS
FROM (
    SELECT CODIGO_TIPO, CODIGO
    FROM REPORTE.TBL_GESTIONES
    GROUP BY CODIGO_TIPO, CODIGO
    HAVING COUNT(1) > 1
) D;

/* Detalle: las claves repetidas y cuántas veces aparecen (top 200) */
SELECT TOP (200)
       CODIGO_TIPO, CODIGO, COUNT(1) AS VECES,
       MIN(FECHA_GESTION) AS FECHA_MIN, MAX(FECHA_GESTION) AS FECHA_MAX
FROM REPORTE.TBL_GESTIONES
GROUP BY CODIGO_TIPO, CODIGO
HAVING COUNT(1) > 1
ORDER BY VECES DESC;
GO
