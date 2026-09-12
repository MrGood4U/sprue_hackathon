import {createContext, useCallback, useContext, useEffect, useRef, useState} from "react";
import {WarningCircle} from "@phosphor-icons/react";
import {Button} from "../components/ui/Button.jsx";
import {Modal} from "../components/ui/Modal.jsx";
import {useI18n} from "../i18n/I18nProvider.jsx";

const NavigationGuardContext = createContext(null);

export function NavigationGuardProvider({currentPath, navigate, children}) {
  const {t} = useI18n();
  const [activeGuard, setActiveGuard] = useState(null);
  const [pendingPath, setPendingPath] = useState(null);

  const setGuard = useCallback((token, active, onDiscard) => {
    setActiveGuard((current) => active ? {token, onDiscard} : current?.token === token ? null : current);
  }, []);

  const guardedNavigate = useCallback((nextPath) => {
    if (nextPath === currentPath) return;
    if (activeGuard) {
      setPendingPath(nextPath);
      return;
    }
    navigate(nextPath);
  }, [activeGuard, currentPath, navigate]);

  const leave = () => {
    const nextPath = pendingPath;
    activeGuard?.onDiscard?.();
    setPendingPath(null);
    if (nextPath) navigate(nextPath);
  };

  return (
    <NavigationGuardContext.Provider value={setGuard}>
      {children(guardedNavigate)}
      {pendingPath && (
        <Modal
          title={t("builder.unsavedTitle")}
          eyebrow={t("builder.unsavedEyebrow")}
          width="520px"
          onClose={() => setPendingPath(null)}
          footer={(
            <>
              <Button autoFocus onClick={() => setPendingPath(null)}>{t("builder.stay")}</Button>
              <Button variant="danger" onClick={leave}>{t("builder.leaveWithoutSaving")}</Button>
            </>
          )}
        >
          <div className="product-delete-warning">
            <WarningCircle size={19} aria-hidden="true" />
            <div>
              <strong>{t("builder.unsavedWarning")}</strong>
              <p>{t("builder.unsavedDetail")}</p>
            </div>
          </div>
        </Modal>
      )}
    </NavigationGuardContext.Provider>
  );
}

export function useUnsavedNavigationGuard(active, onDiscard) {
  const setGuard = useContext(NavigationGuardContext);
  const token = useRef(Symbol("builder-unsaved"));
  const discard = useRef(onDiscard);

  useEffect(() => {
    discard.current = onDiscard;
  }, [onDiscard]);

  useEffect(() => {
    if (!setGuard) return undefined;
    setGuard(token.current, active, () => discard.current?.());
    return () => setGuard(token.current, false);
  }, [active, setGuard]);

  useEffect(() => {
    if (!active) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
