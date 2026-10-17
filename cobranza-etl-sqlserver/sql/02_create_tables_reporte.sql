/* ============================================================================
   02_create_tables_reporte.sql
   Tabla de hechos ACUMULATIVA (crece día a día, NUNCA se hace DROP/TRUNCATE).
   Las cargas son incrementales por día: DELETE del día + INSERT (ver SP).
   Idempotente: solo crea la tabla si no existe.
   Ejecutar EN la base BD_MCOB_REPORTING.

   NOTA: las columnas de negocio conservan EXACTAMENTE los nombres y tipos del
   script original (REPORTE.TBL_GESTIONES_MENSUAL). Se agrega una
   única columna técnica de auditoría ETL al final (FEC_CARGA_DT).
============================================================================ */
USE BD_MCOB_REPORTING;
GO

IF OBJECT_ID(N'REPORTE.TBL_GESTIONES', N'U') IS NULL
BEGIN
    PRINT 'Creando tabla REPORTE.TBL_GESTIONES...';
    CREATE TABLE REPORTE.TBL_GESTIONES
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
        PESO_RESULTADO       INT,
        -- Columna técnica de auditoría ETL (no es de negocio)
        FEC_CARGA_DT         DATETIME2(0) NOT NULL
            CONSTRAINT DF_TBL_GESTIONES_FEC_CARGA DEFAULT (SYSDATETIME())
    );
END
ELSE
    PRINT 'REPORTE.TBL_GESTIONES ya existe — se omite la creación.';
GO
