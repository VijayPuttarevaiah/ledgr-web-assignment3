import { test, expect } from "@playwright/test";
import { signUpNewUser } from "./helpers";

/**
 * Regression test for a real bug (see DECISIONS.md): `profiles` RLS was
 * self-only, so a group member's name silently resolved to the generic
 * "Member" fallback for everyone except themselves — invisible with a
 * single-member group, only surfaced with a real second account.
 */
test("a group member can see their groupmate's real name, not a generic fallback", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const owner = await signUpNewUser(ownerPage, "vis-owner");

  const createRes = await ownerPage.request.post("/api/groups", { data: { name: "Visibility Test Group" } });
  expect(createRes.ok()).toBeTruthy();
  const { group } = await createRes.json();

  const inviteRes = await ownerPage.request.post(`/api/groups/${group.id}/invite`, {
    data: { email: `invitee-${Date.now()}@example.com` },
  });
  expect(inviteRes.ok()).toBeTruthy();
  const { inviteUrl } = await inviteRes.json();
  const token = new URL(inviteUrl).pathname.split("/").pop();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const member = await signUpNewUser(memberPage, "vis-member");

  const acceptRes = await memberPage.request.post(`/api/invites/${token}/accept`);
  expect(acceptRes.ok()).toBeTruthy();

  // The owner's view of the group must show the new member's real name.
  const ownerView = await ownerPage.request.get(`/api/groups/${group.id}`);
  const ownerDetail = await ownerView.json();
  const memberEntry = ownerDetail.members.find((m: { user_id: string; full_name: string }) => m.full_name === member.fullName);
  expect(memberEntry, `expected to find "${member.fullName}" in members list, got: ${JSON.stringify(ownerDetail.members)}`).toBeTruthy();
  expect(ownerDetail.members.some((m: { full_name: string }) => m.full_name === "Member")).toBe(false);

  // And the new member's view must show the owner's real name too (symmetric).
  const memberView = await memberPage.request.get(`/api/groups/${group.id}`);
  const memberDetail = await memberView.json();
  expect(memberDetail.members.some((m: { full_name: string }) => m.full_name === owner.fullName)).toBe(true);
  expect(memberDetail.members.some((m: { full_name: string }) => m.full_name === "Member")).toBe(false);

  await ownerContext.close();
  await memberContext.close();
});
