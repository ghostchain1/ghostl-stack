"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
require("./globals.css");
exports.metadata = {
    title: "GhostControl",
    description: "Central autonomous control plane for the Ghost stack",
};
function RootLayout({ children }) {
    return (<html lang="en">
      <body>
        <div className="container">
          <nav className="nav">
            <a className="pill" href="/">
              Status
            </a>
            <a className="pill" href="/incidents">
              Incidents
            </a>
            <a className="pill" href="/actions">
              Actions
            </a>
            <a className="pill" href="/evidence">
              Evidence
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>);
}
