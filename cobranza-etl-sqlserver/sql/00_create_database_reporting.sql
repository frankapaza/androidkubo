/* ============================================================================
   00_create_database_reporting.sql
   Crea la base de datos de REPORTING separada de la transaccional.

   Origen (transaccional, NO se toca para escritura): BD_MCOB  /  BD_MSEG
   Destino (reporting, acumulativo):                  BD_MCOB_REPORTING

   Idempotente: solo crea la base si no existe.
   Ejecutar como login con permiso de CREATE DATABASE (sysadmin/dbcreator).
============================================================================ */

IF DB_ID(N'BD_MCOB_REPORTING') IS NULL
BEGIN
    PRINT 'Creando base de datos BD_MCOB_REPORTING...';
    CREATE DATABASE BD_MCOB_REPORTING;
END
ELSE
    PRINT 'BD_MCOB_REPORTING ya existe — se omite la creación.';
GO

/* Recovery SIMPLE: este destino se recarga desde el origen, no necesita
   point-in-time recovery y reduce el crecimiento del log en cargas masivas. */
IF EXISTS (SELECT 1 FROM sys.databases
           WHERE name = N'BD_MCOB_REPORTING' AND recovery_model_desc <> N'SIMPLE')
BEGIN
    PRINT 'Estableciendo recovery model SIMPLE en BD_MCOB_REPORTING...';
    ALTER DATABASE BD_MCOB_REPORTING SET RECOVERY SIMPLE;
END
GO
