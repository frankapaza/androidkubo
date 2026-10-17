/* ============================================================================
   05_create_indexes.sql
   Índices de REPORTE.TBL_GESTIONES. Idempotente.
   Ejecutar EN la base BD_MCOB_REPORTING.

   - Clustered por FECHA_GESTION: la carga incremental hace DELETE/INSERT por día
     y las vistas filtran por rango de fecha -> es el patrón de acceso dominante.
   - NC por DOCUMENTO y por (CODIGO_TIPO, CODIGO): búsquedas/joins de consumo.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID(N'REPORTE.TBL_GESTIONES')
                 AND name = N'CIX_TBL_GESTIONES_FECHA')
BEGIN
    PRINT 'Creando índice clustered CIX_TBL_GESTIONES_FECHA...';
    CREATE CLUSTERED INDEX CIX_TBL_GESTIONES_FECHA
        ON REPORTE.TBL_GESTIONES (FECHA_GESTION);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID(N'REPORTE.TBL_GESTIONES')
                 AND name = N'IX_TBL_GESTIONES_DOCUMENTO')
BEGIN
    PRINT 'Creando índice IX_TBL_GESTIONES_DOCUMENTO...';
    CREATE NONCLUSTERED INDEX IX_TBL_GESTIONES_DOCUMENTO
        ON REPORTE.TBL_GESTIONES (DOCUMENTO);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID(N'REPORTE.TBL_GESTIONES')
                 AND name = N'IX_TBL_GESTIONES_CODIGO')
BEGIN
    PRINT 'Creando índice IX_TBL_GESTIONES_CODIGO...';
    CREATE NONCLUSTERED INDEX IX_TBL_GESTIONES_CODIGO
        ON REPORTE.TBL_GESTIONES (CODIGO_TIPO, CODIGO);
END
GO
