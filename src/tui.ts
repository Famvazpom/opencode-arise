import { Plugin } from "@opencode/plugin/tui";
import { BANNER_TOAST_MESSAGE } from "./hooks/arise-banner";

let bannerShownThisProcess = false;

/**
 * V2 moves user-facing notifications into CLI/TUI plugins. This entrypoint is
 * loaded automatically from the package's "./tui" export and shows the same
 * "ARISE!" toast the V1 server plugin used to render.
 */
export default Plugin.define({
  id: "opencode-arise.tui",
  setup(context) {
    // V2 has no "session.created" event; the first execution of a session is
    // the earliest reliable moment to greet the user.
    const stop = context.data.on("session.execution.started", () => {
      if (bannerShownThisProcess) return;
      bannerShownThisProcess = true;

      context.ui.toast.show({
        title: "opencode-arise",
        message: BANNER_TOAST_MESSAGE,
        variant: "info",
        duration: 4000,
      });
    });

    return () => stop();
  },
});
