const BANNER_ASCII = `
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║               ⚔️  A R I S E !  ⚔️                     ║
║                                                       ║
║         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           ║
║         ░░    Shadow Army Assembled    ░░░           ║
║         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           ║
║                                                       ║
║   Monarch ready. Shadows await your command.          ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`;

export const BANNER_TOAST_MESSAGE = "⚔️ ARISE! Shadow Army Assembled. Monarch ready.";

let bannerShownThisProcess = false;

/**
 * V2 server plugins cannot render TUI toasts directly. The banner is printed to
 * the server log, while the optional TUI plugin (src/tui.ts) shows the toast.
 */
export function createAriseBannerHook() {
  return {
    async onSessionCreated() {
      printBannerToConsole();
    },
  };
}

export function getBanner(): string {
  return BANNER_ASCII;
}

export function printBannerToConsole(): void {
  if (!bannerShownThisProcess) {
    console.log(BANNER_ASCII);
    bannerShownThisProcess = true;
  }
}
