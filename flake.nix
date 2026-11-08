{
  description = "Taskmanager - self-hosted projects, tasks and notes for an agency and its customers";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      # Intel macOS (x86_64-darwin) was retired from nixpkgs in 2026 and is not
      # buildable there; Apple Silicon (aarch64-darwin) is supported.
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];

      forAllSystems = nixpkgs.lib.genAttrs systems;

      nixpkgsFor = system: import nixpkgs { inherit system; };

      # The short git commit this flake was built from, for /api/version's build field. A dirty tree has no
      # shortRev, so it takes dirtyShortRev; a flake built without git has neither, and the build is unset.
      build = self.shortRev or (self.dirtyShortRev or null);

      pkgsFor = system: import ./nix/packages.nix { pkgs = nixpkgsFor system; inherit system build; };
    in
    {
      packages = forAllSystems (system: let
        pkgs = pkgsFor system;
      in {
        default = pkgs.arnotes;
        schema = pkgs.schema;
        node-deps = pkgs.nodeDeps;
        node-deps-updater = pkgs.nodeDepsUpdater;
        schema-deps-updater = pkgs.schemaDepsUpdater;
      });

      devShells = forAllSystems (system: {
        default = import ./nix/devshell.nix { pkgs = nixpkgsFor system; };
      });

      # The NixOS module, with its default package set to this flake's own build, so the service reports the
      # commit (build in /api/version) without the deployer passing anything. The bare module keeps the
      # package from nix/packages.nix, which has no git revision.
      nixosModules =
        let
          nixosModule =
            { lib, pkgs, ... }:
            {
              imports = [ (import ./nix/module.nix) ];
              services.arnotes.package = lib.mkDefault self.packages.${pkgs.stdenv.hostPlatform.system}.default;
            };
        in
        {
          default = nixosModule;
          arnotes = nixosModule;
        };
    };
}