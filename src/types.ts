export type AuthenticatedUser = {
  id: string;
  displayName: string;
};

export type AppBindings = Cloudflare.Env & {
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    currentUser: AuthenticatedUser;
  };
};
