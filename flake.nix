{
  description = "Utsuri development and verification environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems =
        f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.gitleaks
            pkgs.lefthook
            pkgs.nodejs_24
            pkgs.svelte-language-server
            pkgs.typescript-language-server
          ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.chromium ];
        };
      });

      checks = forAllSystems (pkgs: {
        toolchain = pkgs.runCommand "utsuri-toolchain-check" {
          nativeBuildInputs = [
            pkgs.bun
            pkgs.nodejs_24
          ];
        } ''
          node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
          test "$node_major" = "24"
          test "$(bun --version)" = "1.3.13"
          touch "$out"
        '';
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
