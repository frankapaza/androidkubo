/* ============================================================================
   SQL_AGENT_JOB_PROCESO_DIARIO_GESTIONES.sql
   Job de SQL Server Agent para la carga diaria.

   ⚠️  ALTERNATIVA al orquestador Node. En este proyecto la ejecución diaria
   la dispara el script Node integrado al panel web
   (src/clientes/contactoeficaz/reporte/gestiones.js). Usa ESTE job SOLO si
   prefieres orquestar dentro de SQL Server en vez del panel.

   ⚠️  ORDEN: debe ejecutarse DESPUÉS de WOLKVOX (que hace el dedup del origen).
   Ajusta @hora_inicio para que caiga después de la corrida de wolkvox.

   Idempotente: si el job ya existe, lo elimina y lo recrea.
============================================================================ */
USE msdb;
GO

DECLARE @nombre_job   SYSNAME      = N'ETL_PROCESO_DIARIO_GESTIONES';
DECLARE @bd_destino   SYSNAME      = N'BD_MCOB_REPORTING';
DECLARE @hora_inicio  INT          = 080000;  -- HHMMSS (08:00:00): tras el reintento de wolkvox de las 7am.

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @nombre_job)
BEGIN
    PRINT 'El job ya existe — se elimina para recrearlo.';
    EXEC msdb.dbo.sp_delete_job @job_name = @nombre_job, @delete_unused_schedule = 1;
END

EXEC msdb.dbo.sp_add_job
     @job_name   = @nombre_job,
     @enabled    = 1,
     @description = N'Carga incremental diaria de REPORTE.TBL_GESTIONES. Ejecutar después de WOLKVOX.';

/* Paso 1: carga incremental del día ANTERIOR (default del SP sin parámetros). */
EXEC msdb.dbo.sp_add_jobstep
     @job_name        = @nombre_job,
     @step_name       = N'Procesar gestiones del día anterior',
     @subsystem       = N'TSQL',
     @database_name   = @bd_destino,
     @command         = N'EXEC ETL.SP_PROCESAR_GESTIONES;',
     @retry_attempts  = 2,
     @retry_interval  = 5,   -- minutos
     @on_success_action = 1, -- salir con éxito
     @on_fail_action    = 2; -- salir con fallo

EXEC msdb.dbo.sp_add_jobserver @job_name = @nombre_job;

EXEC msdb.dbo.sp_add_jobschedule
     @job_name       = @nombre_job,
     @name           = N'Diario',
     @freq_type      = 4,            -- diario
     @freq_interval  = 1,            -- cada 1 día
     @active_start_time = @hora_inicio;

PRINT 'Job ETL_PROCESO_DIARIO_GESTIONES creado.';
GO
