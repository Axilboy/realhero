import { useI18n } from "../i18n/I18nContext";

export default function ActionsScreen() {
  const { t } = useI18n();
  return (
    <div className="screen">
      <p className="screen__badge">{t("actions.badge")}</p>
      <h1 className="screen__title">{t("actions.title")}</h1>
      <p className="screen__text">{t("actions.text")}</p>
      <div className="screen__placeholder">{t("actions.placeholder")}</div>
    </div>
  );
}
