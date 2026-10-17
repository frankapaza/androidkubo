/* ============================================================================
   01_create_schemas.sql
   Crea los esquemas del destino. Idempotente.
   Ejecutar EN la base BD_MCOB_REPORTING.

     REPORTE -> tablas y vistas de consumo
     STG     -> staging (zona de aterrizaje volátil)
     ETL     -> procedimientos y tabla de log del proceso
============================================================================ */
USE BD_MCOB_REPORTING;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'REPORTE')
    EXEC('CREATE SCHEMA REPORTE');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'STG')
    EXEC('CREATE SCHEMA STG');
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ETL')
    EXEC('CREATE SCHEMA ETL');
GO
