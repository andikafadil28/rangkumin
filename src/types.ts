export type AuthenticatedUser = {
  id: string;
  displayName: string;
};

export type AppBindings = Cloudflare.Env & {
  ACCESS_AUD?: string;
  ACCESS_TEAM_DOMAIN?: string;
  WEB_PUSH_VAPID_SUBJECT?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    currentUser: AuthenticatedUser;
  };
};
