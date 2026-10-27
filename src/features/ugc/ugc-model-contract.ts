export type UgcModelTier = "standard" | "premium";
export type UgcModelIdentity = {
  tier: UgcModelTier;
  provider: "fal";
  endpointId: string;
  /** Application capability contract revision, not a fabricated provider model version. */
  version: 1;
};

/** Safe presentation projection supplied by the server; no routing, prices or credentials. */
export type UgcModelOption = {
  tier: UgcModelTier; durations: readonly number[]; aspectRatios: readonly string[]; resolution: "source-derived";
};
