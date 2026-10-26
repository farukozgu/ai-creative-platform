import "server-only";

import {createClient} from "@/lib/supabase/server";

const profileFields = "id, display_name, avatar_url, created_at, updated_at";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

async function readProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const {data, error} = await supabase
    .from("profiles")
    .select(profileFields)
    .eq("id", userId)
    .abortSignal(AbortSignal.timeout(10_000))
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load profile.");
  }

  return data as Profile | null;
}

export async function getOrCreateProfile(userId: string): Promise<Profile> {
  const existingProfile = await readProfile(userId);
  if (existingProfile) {
    return existingProfile;
  }

  const supabase = await createClient();
  const {data, error} = await supabase.from("profiles").insert({id: userId}).select(profileFields).single();

  if (!error && data) return data as Profile;

  if (error && error.code !== "23505") {
    throw new Error("Unable to create profile.");
  }

  const profile = await readProfile(userId);
  if (!profile) {
    throw new Error("Unable to load profile.");
  }

  return profile;
}
