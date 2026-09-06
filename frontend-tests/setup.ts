import "fake-indexeddb/auto";

const browserWindow = new EventTarget() as Window & typeof globalThis;
Object.defineProperty(browserWindow, "location", {
  value: new URL("https://rangkumin.example.invalid/"),
});
Object.defineProperty(globalThis, "window", { value: browserWindow });
