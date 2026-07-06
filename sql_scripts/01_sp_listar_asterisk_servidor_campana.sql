-- ============================================================================
-- SP companion de ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR.
-- Devuelve UNA fila por (servidor + campaña) con los MISMOS joins/filtros/ventana
-- de 3 días, pero SIN GROUP BY MIN/MAX: expone cada ID_CAMP_PROV_EXT_SI.
-- El SP original SP_LISTAR_ASTERISK_SERVIDOR NO se modifica.
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
      AND CONVERT(DATE, T0.FEC_CRE_DT) > CONVERT(DATE, GETDATE()-3)
    GROUP BY T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
             T0.ID_CAMP_PROV_EXT_SI;
END
GO
