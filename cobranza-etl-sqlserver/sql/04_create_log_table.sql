/* ============================================================================
   04_create_log_table.sql
   Tabla de auditoría de ejecuciones del ETL. Idempotente.
   Ejecutar EN la base BD_MCOB_REPORTING.

   Cada SP registra una fila al inicio (ESTADO='EN_PROCESO') y la actualiza al
   final (OK / ERROR) con conteos y mensaje. Incluye cuántas filas se
   eliminaron e insertaron, requisito para auditar la carga y el dedup.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

IF OBJECT_ID(N'ETL.TBL_PROCESO_LOG', N'U') IS NULL
BEGIN
    PRINT 'Creando tabla ETL.TBL_PROCESO_LOG...';
    CREATE TABLE ETL.TBL_PROCESO_LOG
    (
        ID_LOG          BIGINT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_TBL_PROCESO_LOG PRIMARY KEY,
        NOMBRE_PROCESO  VARCHAR(100)  NOT NULL,
        FECHA_INICIO_RANGO DATE       NULL,   -- inicio del rango de datos procesado [inclusivo]
        FECHA_FIN_RANGO    DATE       NULL,   -- fin del rango de datos procesado    [exclusivo]
        FEC_INICIO_DT   DATETIME2(0)  NOT NULL CONSTRAINT DF_PROCESO_LOG_INI DEFAULT (SYSDATETIME()),
        FEC_FIN_DT      DATETIME2(0)  NULL,
        DURACION_SEG    INT           NULL,
        ESTADO          VARCHAR(20)   NOT NULL,   -- EN_PROCESO | OK | ERROR
        FILAS_ELIMINADAS BIGINT       NULL,
        FILAS_INSERTADAS BIGINT       NULL,
        FILAS_AFECTADAS  BIGINT       NULL,       -- usado por el dedup (UPDATE)
        MENSAJE         NVARCHAR(MAX) NULL
    );

    CREATE INDEX IX_PROCESO_LOG_PROC_FEC
        ON ETL.TBL_PROCESO_LOG (NOMBRE_PROCESO, FEC_INICIO_DT DESC);
END
ELSE
    PRINT 'ETL.TBL_PROCESO_LOG ya existe — se omite la creación.';
GO
