// deno-lint-ignore-file
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const env = Deno.env.toObject();

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !(
    SUPABASE_URL &&
    SUPABASE_SERVICE_ROLE_KEY
  )
) {
  console.log("A secret is missing");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Read the request body
    const { action, groupId, link, maxUses, expirationTime } = await req.json();

    if (!action) {
      throw new Error("You must specify a valid action: 'create' or 'validate'.");
    }

    // Check which action to perform
    if (action === "create") {
      if (!groupId || !maxUses || !expirationTime) {
        throw new Error("Missing parameters to create the invitation.");
      }

      const invitation = await createInvitation(
        groupId,
        maxUses,
        new Date(expirationTime)
      );
      const invitationLink = `cherryapp://invitation/${invitation.invitation_link}`;

      return jsonResponse({ invitationLink });
    }

    if (action === "validate") {
      if (!link) {
        throw new Error("Missing link to validate.");
      }

      const validationResult = await validateInvitation(link);

      return jsonResponse(validationResult);
    }

    throw new Error("Unrecognized action.");
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 400);
  }
});

async function createInvitation(groupId: string, maxUses: number, expirationTime: Date) {
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data, error } = await supabase
    .from("invitations")
    .insert([
      {
        group_id: groupId,
        invitation_link: crypto.randomUUID(),
        expiration_time: expirationTime,
        max_uses: maxUses,
      },
    ])
    .select();

  if (error) {
    throw new Error("Error creating the link: " + error.message);
  }

  return data[0];
}

async function validateInvitation(link: string) {
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("invitation_link", link)
    .single();

  if (error || !data) {
    throw new Error("The link is not valid.");
  }

  const now = new Date();
  if (new Date(data.expiration_time) < now) {
    throw new Error("The link has expired.");
  }

  if (data.uses >= data.max_uses) {
    throw new Error("The link has reached its usage limit.");
  }

  // Increment the usage counter
  await incrementUses(data.id, data.uses + 1);

  return { groupId: data.group_id, message: "Valid invitation." };
}

async function incrementUses(id: string, newUses: number) {
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  );

  const { error } = await supabase
    .from("invitations")
    .update({ uses: newUses })
    .eq("id", id);

  if (error) {
    throw new Error("Error updating usage: " + error.message);
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/company-invitations' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
