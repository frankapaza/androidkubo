-- ============================================================================
-- Ventana del SP companion: 2 días normalmente, hasta el viernes después del
-- fin de semana. Reemplaza a 02_ampliar_ventana_sp_campana.sql (5 días fijos).
--
-- Motivo (incidente 2026-11-10, campañas 12878-12880 EXPERTO):
--   Campañas creadas el viernes 06/11 y marcadas el lunes 09/11 quedaron fuera
--   de la corrida del martes 10/11 (ventana `> GETDATE()-3`), y se perdieron
--   ~20 500 gestiones. Una ventana fija de 5 días lo evita, pero cada campaña
--   vieja sin llamadas se reintenta y figura como pendiente en la
--   reconciliación todos los días.
--
-- Regla (día de la corrida, hora del servidor de BD = Lima):
--   lunes  → desde el viernes (GETDATE()-3): turno tarde del lunes.
--   martes → desde el viernes (GETDATE()-4): turno mañana que procesa el lunes.
--   resto  → últimos 2 días (GETDATE()-2), igual que la ventana original.
--   (DATEPART(WEEKDAY) + @@DATEFIRST) % 7 da 1=domingo, 2=lunes, 3=martes sin
--   depender de SET DATEFIRST.
--   Los feriados no se contemplan.
--
-- NOTA: solo se modifica el SP companion (lo usa la ingesta kubot). El SP
--       original ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR NO se toca.
-- Idempotente (CREATE OR ALTER).
-- ============================================================================
USE BD_MCOB;
GO
CREATE OR ALTER PROCEDURE ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @dias INT = CASE (DATEPART(WEEKDAY, GETDATE()) + @@DATEFIRST) % 7
                            WHEN 2 THEN 3   -- lunes
                            WHEN 3 THEN 4   -- martes
                            ELSE 2
                        END;
    SELECT T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
           T0.ID_CAMP_PROV_EXT_SI
    FROM CONFIGURACION.TBL_CONFIGURACION T0
    INNER JOIN BD_MSEG.dbo.TBL_ASTERISK_SERVIDOR T1
        ON SUBSTRING(T1.AMI_USER_VC,1,20) = SUBSTRING(T0.SERV_PROV_EXT_VC,1,20)
    WHERE T0.FLG_EST_BO = 1
      AND T0.FLG_ACT_BO = 1
      AND CONVERT(DATE, T0.FEC_CRE_DT) >= CONVERT(DATE, DATEADD(DAY, -@dias, GETDATE()))
    GROUP BY T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
             T0.ID_CAMP_PROV_EXT_SI;
END
GO
