import {Component} from "react";
import {WarningCircle} from "@phosphor-icons/react";
import {Button} from "../components/ui/Button.jsx";
import {useI18n} from "../i18n/I18nProvider.jsx";

class CreatorRouteBoundary extends Component {
  state = {error: null};

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Sprue creator route render failed]", {
      route: this.props.resetKey,
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({error: null});
    }
  }

  retry = () => {
    this.setState({error: null});
  };

  backToProducts = () => {
    this.setState({error: null});
    this.props.navigate("/app");
  };

  render() {
    if (this.state.error) {
      return this.props.renderFailure({
        retry: this.retry,
        backToProducts: this.backToProducts,
      });
    }
    return this.props.children;
  }
}

export function CreatorRouteErrorBoundary({children, path, navigate}) {
  const {t} = useI18n();

  return (
    <CreatorRouteBoundary
      resetKey={path}
      navigate={navigate}
      renderFailure={({retry, backToProducts}) => (
        <main className="runtime-gate">
          <div className="panel" role="alert">
            <WarningCircle size={28} />
            <span className="section-label">{t("creatorRoute.errorLabel")}</span>
            <h1>{t("creatorRoute.errorTitle")}</h1>
            <p>{t("creatorRoute.errorDetail")}</p>
            <div className="auth-actions">
              <Button variant="primary" onClick={retry}>{t("common.retry")}</Button>
              <Button onClick={backToProducts}>{t("productHeader.backToProducts")}</Button>
            </div>
          </div>
        </main>
      )}
    >
      {children}
    </CreatorRouteBoundary>
  );
}
