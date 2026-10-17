/* ============================================================================
   ETL.SP_RECARGAR_GESTIONES_RANGO
   Carga/recarga histórica de un rango amplio (p.ej. la carga inicial desde el
   1 del mes en curso, para que VW_GESTIONES_MENSUAL quede completa). Procesa DÍA POR DÍA llamando a ETL.SP_PROCESAR_GESTIONES,
   de modo que cada día queda idempotente y las transacciones son cortas
   (no un único INSERT gigante). Restartable: si falla un día, los anteriores
   ya quedaron confirmados.
   Ejecutar EN la base BD_MCOB_REPORTING.

   Parámetros (rango semiabierto [@FECHA_INICIO, @FECHA_FIN)):
     @FECHA_INICIO  DATE  inclusivo (obligatorio).
     @FECHA_FIN     DATE  exclusivo. NULL -> hoy (incluye hasta AYER, igual que la carga diaria).
============================================================================ */
USE BD_MCOB_REPORTING;
GO

CREATE OR ALTER PROCEDURE ETL.SP_RECARGAR_GESTIONES_RANGO
    @FECHA_INICIO DATE,
    @FECHA_FIN    DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @FECHA_INICIO IS NULL
        THROW 50002, '@FECHA_INICIO es obligatorio.', 1;
    IF @FECHA_FIN IS NULL
        SET @FECHA_FIN = CAST(GETDATE() AS DATE);
    IF @FECHA_FIN <= @FECHA_INICIO
        THROW 50003, 'El rango es inválido: @FECHA_FIN debe ser mayor que @FECHA_INICIO.', 1;

    DECLARE @DIA DATE = @FECHA_INICIO;

    WHILE @DIA < @FECHA_FIN
    BEGIN
        PRINT CONCAT('Procesando día ', CONVERT(VARCHAR(10), @DIA, 23), '...');
        EXEC ETL.SP_PROCESAR_GESTIONES
            @FECHA_INICIO = @DIA,
            @FECHA_FIN    = NULL;   -- NULL -> el SP toma @DIA + 1 (un solo día)

        SET @DIA = DATEADD(DAY, 1, @DIA);
    END

    PRINT 'Recarga de rango finalizada.';
END
GO
