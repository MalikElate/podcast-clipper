import { PlatformProvider } from "./PlatformProvider.js";

class UpcomingProvider extends PlatformProvider {
  get configured() { return false; }
}

export class SnapchatProvider extends UpcomingProvider {
  constructor(dependencies) { super("snapchat", dependencies); }
}
