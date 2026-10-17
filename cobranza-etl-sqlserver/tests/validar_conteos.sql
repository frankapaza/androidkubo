/* ============================================================================
   validar_conteos.sql
   Compara el conteo del ORIGEN vs el DESTINO para un día dado.
   Deben coincidir (el ETL no filtra filas: es UNION ALL de las dos fuentes).
   Ajusta @DIA al día que quieras validar.
   Ejecutar EN la base BD_MCOB_REPORTING.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

DECLARE @DIA DATE = CAST(GETDATE() AS DATE);   -- <-- cambia el día a validar
DECLARE @FIN DATE = DATEADD(DAY, 1, @DIA);

;WITH ORIGEN AS (
    SELECT COUNT(1) AS N
    FROM BD_MCOB.CALL.TBL_GESTION_CALL
    WHERE FLG_EST_BO = 1 AND FEC_GEST_DT >= @DIA AND FEC_GEST_DT < @FIN
    UNION ALL
    SELECT COUNT(1)
    FROM BD_MCOB.CALL.TBL_GESTION_VARIOS
    WHERE FLG_EST_BO = 1 AND FEC_GEST_DT >= @DIA AND FEC_GEST_DT < @FIN
)
SELECT
    @DIA                                              AS DIA,
    (SELECT SUM(N) FROM ORIGEN)                       AS TOTAL_ORIGEN,
    (SELECT COUNT(1) FROM REPORTE.TBL_GESTIONES
       WHERE FECHA_GESTION >= @DIA AND FECHA_GESTION < @FIN) AS TOTAL_DESTINO,
    CASE WHEN (SELECT SUM(N) FROM ORIGEN) =
              (SELECT COUNT(1) FROM REPORTE.TBL_GESTIONES
                 WHERE FECHA_GESTION >= @DIA AND FECHA_GESTION < @FIN)
         THEN 'OK' ELSE 'DESCUADRE' END              AS RESULTADO;

/* Detalle por tipo (1=GESTIONES/CALL, 2=CARGAS/VARIOS) en el destino */
SELECT CODIGO_TIPO, COUNT(1) AS FILAS
FROM REPORTE.TBL_GESTIONES
WHERE FECHA_GESTION >= @DIA AND FECHA_GESTION < @FIN
GROUP BY CODIGO_TIPO
ORDER BY CODIGO_TIPO;
GO
