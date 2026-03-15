import React from "react";
import { render } from "ink";
import { App } from "./components/App.js";

// Clear terminal for fullscreen layout
process.stdout.write("\x1b[2J\x1b[H");

render(<App />);
