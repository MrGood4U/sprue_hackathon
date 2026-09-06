import { useEffect, useState } from "react";
import { Brain, CheckCircle, CircleNotch, Eye, EyeSlash, ShieldWarning } from "@phosphor-icons/react";
import { AppHeader } from "../components/layout/AppHeader.jsx";
import { Button, IconButton } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { Status } from "../components/ui/Status.jsx";
import { useModelProfile } from "../features/model-settings/useModelProfile.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import "../features/model-settings/model-settings.css";

function validate(values, hasApiKey, t) {
  const errors = {};
  let url;
  try {
    url = new URL(values.apiUrl.trim());
  } catch {
    errors.apiUrl = t("modelService.error.apiUrl");
  }
  if (url && (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)) {
    errors.apiUrl = t("modelService.error.apiUrl");
  }
  if (!values.model.trim() || values.model.trim().length > 200) errors.model = t("modelService.error.model");
  if (!hasApiKey && !values.apiKey.trim()) errors.apiKey = t("modelService.error.apiKey");
  if (values.apiKey.length > 4096) errors.apiKey = t("modelService.error.apiKeyLength");
  return errors;
}

export function ModelServicePage() {
  const {t} = useI18n();
  const {profile, status, save} = useModelProfile();
  const [values, setValues] = useState({apiUrl: "", apiKey: "", model: ""});
  const [errors, setErrors] = useState({});
  const [showKey, setShowKey] = useState(false);
  const isSaving = status === "saving";

  useEffect(() => {
    if (profile) setValues((current) => ({...current, apiUrl: profile.apiUrl, model: profile.model, apiKey: ""}));
  }, [profile]);

  const update = (field) => (event) => {
    setValues((current) => ({...current, [field]: event.target.value}));
    setErrors((current) => ({...current, [field]: undefined}));
  };

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const nextErrors = validate(values, profile?.hasApiKey, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      globalThis.setTimeout(() => form.querySelector("[aria-invalid='true']")?.focus(), 0);
      return;
    }
    try {
      await save({
        apiUrl: values.apiUrl.trim(),
        apiKey: values.apiKey.trim() || undefined,
        model: values.model.trim(),
      });
      setValues((current) => ({...current, apiKey: ""}));
    } catch {
      // The hook exposes the localized page-level failure state.
    }
  };

  const feedback = status === "saved"
    ? t("modelService.saved")
    : status === "error"
      ? t("modelService.saveError")
      : status === "loading"
        ? t("modelService.loading")
        : profile?.configured
          ? t("modelService.configuredHint")
          : t("modelService.unconfiguredHint");

  return (
    <div className="page model-service-page">
      <AppHeader title={t("modelService.title")} subtitle={t("modelService.subtitle")} />
      <main className="model-service-layout">
        <section className="panel model-service-card">
          <div className="model-service-card-header">
            <div>
              <span className="panel-kicker"><Brain size={18} aria-hidden="true" /> {t("modelService.cardEyebrow")}</span>
              <h2>{t("modelService.cardTitle")}</h2>
              <p>{t("modelService.cardDescription")}</p>
            </div>
            <Status tone={profile?.configured ? "violet" : "amber"}>
              {profile?.configured ? t("modelService.configured") : t("modelService.notConfigured")}
            </Status>
          </div>

          <form className="model-service-form" noValidate onSubmit={submit}>
            <Field htmlFor="model-api-url" label={t("modelService.apiUrl")} hint={t("modelService.apiUrlHint")}>
              <input
                id="model-api-url"
                type="url"
                value={values.apiUrl}
                onChange={update("apiUrl")}
                placeholder="https://api.example.com/v1/chat/completions"
                autoComplete="url"
                spellCheck="false"
                aria-invalid={Boolean(errors.apiUrl)}
                aria-describedby={errors.apiUrl ? "model-api-url-error" : undefined}
                disabled={isSaving || status === "loading"}
                required
              />
              {errors.apiUrl && <span id="model-api-url-error" className="model-field-error" role="alert">{errors.apiUrl}</span>}
            </Field>

            <Field htmlFor="model-api-key" label={t("modelService.apiKey")} hint={profile?.hasApiKey ? t("modelService.apiKeyStoredHint") : t("modelService.apiKeyHint")}>
              <div className="model-secret-control">
                <input
                  id="model-api-key"
                  type={showKey ? "text" : "password"}
                  value={values.apiKey}
                  onChange={update("apiKey")}
                  placeholder={profile?.hasApiKey ? t("modelService.apiKeyStoredPlaceholder") : t("modelService.apiKeyPlaceholder")}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.apiKey)}
                  aria-describedby={errors.apiKey ? "model-api-key-error" : undefined}
                  disabled={isSaving || status === "loading"}
                  required={!profile?.hasApiKey}
                />
                <IconButton
                  type="button"
                  label={showKey ? t("modelService.hideApiKey") : t("modelService.showApiKey")}
                  onClick={() => setShowKey((current) => !current)}
                  disabled={isSaving || status === "loading"}
                >
                  {showKey ? <EyeSlash size={17} /> : <Eye size={17} />}
                </IconButton>
              </div>
              {errors.apiKey && <span id="model-api-key-error" className="model-field-error" role="alert">{errors.apiKey}</span>}
            </Field>

            <Field htmlFor="model-name" label={t("modelService.model")} hint={t("modelService.modelHint")}>
              <input
                id="model-name"
                value={values.model}
                onChange={update("model")}
                placeholder="gpt-4.1-mini"
                autoComplete="off"
                spellCheck="false"
                aria-invalid={Boolean(errors.model)}
                aria-describedby={errors.model ? "model-name-error" : undefined}
                disabled={isSaving || status === "loading"}
                required
              />
              {errors.model && <span id="model-name-error" className="model-field-error" role="alert">{errors.model}</span>}
            </Field>

            <div className="model-service-submit">
              <div className={`model-service-feedback ${status === "saved" ? "is-success" : status === "error" ? "is-error" : ""}`} aria-live="polite">
                {status === "saved" && <CheckCircle size={15} aria-hidden="true" />} {feedback}
              </div>
              <Button className={isSaving ? "is-saving" : ""} type="submit" variant="primary" icon={isSaving ? CircleNotch : Brain} disabled={isSaving || status === "loading"}>
                {isSaving ? t("modelService.saving") : t("modelService.save")}
              </Button>
            </div>
          </form>
        </section>

        <aside className="panel model-service-guide">
          <div className="model-service-guide-heading">
            <span className="section-label">{t("modelService.usageEyebrow")}</span>
            <h2>{t("modelService.usageTitle")}</h2>
            <p>{t("modelService.usageDescription")}</p>
          </div>
          <ol className="model-service-steps">
            <li><span>1</span>{t("modelService.stepOne")}</li>
            <li><span>2</span>{t("modelService.stepTwo")}</li>
            <li><span>3</span>{t("modelService.stepThree")}</li>
          </ol>
          <div className="model-service-session-note">
            <ShieldWarning size={18} aria-hidden="true" />
            <div><strong>{t("modelService.sessionTitle")}</strong><br />{t("modelService.sessionDetail")}</div>
          </div>
        </aside>
      </main>
    </div>
  );
}
