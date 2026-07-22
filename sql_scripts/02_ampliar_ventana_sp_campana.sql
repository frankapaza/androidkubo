-- ============================================================================
-- Amplía la ventana del SP companion de 3 a 5 días (e inclusiva del borde).
--
-- Motivo (incidente 2026-07-21, campaña 11581 EXPERTO):
--   Con la ventana estricta `> GETDATE()-3`, una campaña creada justo 3 días
--   antes (11581, creada 2026-07-18) quedaba EXCLUIDA de la corrida del
--   2026-07-21 aunque tuviera actividad el 2026-07-20 → se perdían gestiones.
--   Se cambia a `>= GETDATE()-5` (últimos 5 días, incluyendo el borde) para dar
--   margen a campañas creadas días antes que siguen con actividad.
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
    SELECT T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
           T0.ID_CAMP_PROV_EXT_SI
    FROM CONFIGURACION.TBL_CONFIGURACION T0
    INNER JOIN BD_MSEG.dbo.TBL_ASTERISK_SERVIDOR T1
        ON SUBSTRING(T1.AMI_USER_VC,1,20) = SUBSTRING(T0.SERV_PROV_EXT_VC,1,20)
    WHERE T0.FLG_EST_BO = 1
      AND T0.FLG_ACT_BO = 1
      AND CONVERT(DATE, T0.FEC_CRE_DT) >= CONVERT(DATE, GETDATE()-5)   -- antes: > GETDATE()-3
    GROUP BY T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
             T0.ID_CAMP_PROV_EXT_SI;
END
GO
