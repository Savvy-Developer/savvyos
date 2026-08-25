declare module "aircall-everywhere" {
  type Callback = (value: unknown) => void;
  type WorkspaceOptions = {
    domToLoadWorkspace: string;
    size?: "big" | "small" | "auto";
    onLogin?: (settings: unknown) => void;
    onLogout?: () => void;
  };

  export default class AircallWorkspace {
    constructor(options: WorkspaceOptions);
    on(eventName: string, callback: Callback): void;
    send(eventName: string, payload: unknown, callback?: (success: boolean, data: unknown) => void): boolean;
  }
}
