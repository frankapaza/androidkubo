/* ============================================================================
   03_create_tables_staging.sql
   Tabla de STAGING: zona de aterrizaje volátil. Se TRUNCA en cada corrida.
   Tiene EXACTAMENTE las mismas columnas de negocio que REPORTE.TBL_GESTIONES,
   en el mismo orden, SIN la columna técnica FEC_CARGA_DT.
   Idempotente. Ejecutar EN la base BD_MCOB_REPORTING.

   Patrón de carga (ver ETL.SP_PROCESAR_GESTIONES):
     1) TRUNCATE STG  +  INSERT desde el origen (consulta pesada cross-database)
     2) En transacción corta: DELETE del día en REPORTE + INSERT desde STG
   Aísla la consulta pesada del lock sobre la tabla final.
============================================================================ */
USE BD_MCOB_REPORTING;
GO

IF OBJECT_ID(N'STG.TBL_GESTIONES_STG', N'U') IS NULL
BEGIN
    PRINT 'Creando tabla STG.TBL_GESTIONES_STG...';
    CREATE TABLE STG.TBL_GESTIONES_STG
    (
        CODIGO_TIPO          INT,
        DES_TIP_VC           VARCHAR(20),
        DES_TIP_DET_VC       VARCHAR(20),
        CODIGO               BIGINT,
        ID_CONFIGURACION     BIGINT,
        NOMBRE_CONFIGURACION VARCHAR(255),
        DOCUMENTO            VARCHAR(20),
        NOMBRE_COMPLETO      VARCHAR(200),
        NUMERO_CUENTA        VARCHAR(30),
        DES_PROD_VC          VARCHAR(100),
        DES_GRUP_VC          VARCHAR(100),
        DES_SEGM_VC          VARCHAR(100),
        DES_ESTR_VC          VARCHAR(100),
        PROVEEDOR            VARCHAR(100),
        CARTERA              VARCHAR(100),
        SUBCARTERA           VARCHAR(100),
        FECHA_GESTION        DATE,
        HORA_GESTION         TIME,
        TELEFONO             VARCHAR(30),
        TIPO_GESTION         VARCHAR(150),
        TIPO_CONTACTO        VARCHAR(150),
        TIPO_RESULTADO       VARCHAR(150),
        TIPO_SOLUCION        VARCHAR(150),
        FECHA_CITA           DATE,
        HORA_CITA            TIME,
        FECHA_RELLAMADA      DATE,
        HORA_RELLAMADA       TIME,
        HORARIO_UBICACION    TIME,
        MONTO_CANCELACION    DECIMAL(18,4),
        FECHA_CANCELACION    DATE,
        NUMERO_AGENCIA       VARCHAR(50),
        FECHA_COMPROMISO     DATE,
        IMPORTE_COMPROMISO   DECIMAL(18,4),
        FECHA_OPORTUNIDAD    DATE,
        IMPORTE_OPORTUNIDAD  DECIMAL(18,4),
        VALOR_CUOTA_INICIAL  DECIMAL(18,4),
        FECHA_CUOTA_INICIAL  DATE,
        VALOR_CUOTA_MENSUAL  DECIMAL(18,4),
        NUMERO_CUOTAS        INT,
        OBSERVACION          VARCHAR(MAX),
        MONTO_CAPITAL        DECIMAL(18,4),
        MONTO_DEUDA_TOTAL    DECIMAL(18,4),
        ASESOR_ASIGNADO      VARCHAR(50),
        ASESOR_GESTIONA      VARCHAR(50),
        SUPERVISOR_ASIGNADO  VARCHAR(50),
        STATUS               VARCHAR(100),
        CONDICION            VARCHAR(100),
        ESTADO_CLIENTE       VARCHAR(20),
        PESO_RESULTADO       INT
    );
END
ELSE
    PRINT 'STG.TBL_GESTIONES_STG ya existe — se omite la creación.';
GO
