/* ============================================================================
   ETL.SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS
   Limpieza de duplicados en el ORIGEN: BD_MCOB.CALL.TBL_GESTION_VARIOS.
   Inactiva lógicamente (FLG_EST_BO=0) las filas repetidas, conservando la de
   menor ID_GEST_CALL_BI por clave de negocio. NO elimina físicamente.
   Registra cuántas filas fueron afectadas en ETL.TBL_PROCESO_LOG.

   ⚠️  USO OPCIONAL / HISTÓRICO.
   En el día a día este dedup YA lo realiza el proceso WOLKVOX antes del ETL,
   por lo que este SP NO se invoca en la carga diaria. Úsalo solo para la
   carga inicial histórica o correcciones puntuales.

   ⚠️  PERMISOS: escribe sobre la base transaccional BD_MCOB. El login que lo
   ejecute necesita UPDATE sobre BD_MCOB.CALL.TBL_GESTION_VARIOS.

   Parámetros (rango semiabierto [@FECHA_INICIO, @FECHA_FIN) sobre FEC_GEST_DT):
     @FECHA_INICIO  DATE  inclusivo (obligatorio).
     @FECHA_FIN     DATE  exclusivo. NULL -> hoy + 1 día.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

CREATE OR ALTER PROCEDURE ETL.SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS
    @FECHA_INICIO DATE,
    @FECHA_FIN    DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @FECHA_INICIO IS NULL
        THROW 50004, '@FECHA_INICIO es obligatorio.', 1;
    IF @FECHA_FIN IS NULL
        SET @FECHA_FIN = DATEADD(DAY, 1, CAST(GETDATE() AS DATE));

    DECLARE @PROC    VARCHAR(100) = 'SP_LIMPIAR_DUPLICADOS_GESTION_VARIOS',
            @ID_LOG  BIGINT,
            @AFECT   BIGINT = 0,
            @INI_DT  DATETIME2(0) = SYSDATETIME();

    INSERT INTO ETL.TBL_PROCESO_LOG
        (NOMBRE_PROCESO, FECHA_INICIO_RANGO, FECHA_FIN_RANGO, ESTADO)
    VALUES
        (@PROC, @FECHA_INICIO, @FECHA_FIN, 'EN_PROCESO');
    SET @ID_LOG = SCOPE_IDENTITY();

    BEGIN TRY
        IF @FECHA_FIN <= @FECHA_INICIO
            THROW 50005, 'El rango es inválido: @FECHA_FIN debe ser mayor que @FECHA_INICIO.', 1;

        UPDATE GSV
        SET GSV.FLG_EST_BO = 0,
            GSV.USU_ELI_SI = 2,
            GSV.FEC_ELI_DT = GETDATE(),
            GSV.IP_ELI_VC  = '[auto-dedup]'
        FROM (
            SELECT ID_GEST_CALL_BI,
                   ROW_NUMBER() OVER (
                       PARTITION BY ID_TEL_BI, ID_CLIE_BI, ID_TIP_GES_SI,
                                    ID_TIP_RES_SI, ID_TIP_SOL_SI,
                                    FEC_GEST_DT, TEX_OBS_VC, USU_CRE_SI, IP_CRE_VC
                       ORDER BY ID_GEST_CALL_BI
                   ) AS NU_ORDEN
            FROM BD_MCOB.CALL.TBL_GESTION_VARIOS
            WHERE FLG_EST_BO = 1
              AND FEC_GEST_DT >= @FECHA_INICIO
              AND FEC_GEST_DT <  @FECHA_FIN
        ) DUP
        INNER JOIN BD_MCOB.CALL.TBL_GESTION_VARIOS GSV
            ON GSV.ID_GEST_CALL_BI = DUP.ID_GEST_CALL_BI
        WHERE DUP.NU_ORDEN > 1;

        SET @AFECT = @@ROWCOUNT;

        UPDATE ETL.TBL_PROCESO_LOG
        SET ESTADO          = 'OK',
            FEC_FIN_DT      = SYSDATETIME(),
            DURACION_SEG    = DATEDIFF(SECOND, @INI_DT, SYSDATETIME()),
            FILAS_AFECTADAS = @AFECT,
            MENSAJE         = CONCAT('Duplicados inactivados: ', @AFECT)
        WHERE ID_LOG = @ID_LOG;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        UPDATE ETL.TBL_PROCESO_LOG
        SET ESTADO       = 'ERROR',
            FEC_FIN_DT   = SYSDATETIME(),
            DURACION_SEG = DATEDIFF(SECOND, @INI_DT, SYSDATETIME()),
            MENSAJE      = CONCAT('ERROR ', ERROR_NUMBER(), ' (línea ', ERROR_LINE(), '): ', ERROR_MESSAGE())
        WHERE ID_LOG = @ID_LOG;

        THROW;
    END CATCH
END
GO
