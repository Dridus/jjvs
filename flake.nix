{
  description = "jjvs – Jujutsu for VSCode development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # JavaScript runtime
            nodejs_22

            # Package manager
            # pnpm manages project dependencies; use pkgs.pnpm for the CLI
            pnpm

            # VS Code Extension Manager – for packaging and publishing
            vsce

            # TypeScript language server (for editor support outside of pnpm devDeps)
            nodePackages.typescript-language-server
          ];

          shellHook = ''
            echo ""
            echo "jjvs dev environment"
            echo "  Node:  $(node --version)"
            echo "  pnpm:  $(pnpm --version)"
            echo "  vsce:  $(vsce --version 2>/dev/null || echo 'n/a')"
            echo ""
            echo "Run 'pnpm install' to install project dependencies."
            echo "Run 'pnpm build:watch' to start the build watcher."
            echo ""
          '';
        };
      });
}
