import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Page from "./page";
const mocks=vi.hoisted(()=>({tier:vi.fn(),fetch:vi.fn(),client:{},redirect:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabase:async()=>mocks.client}));
vi.mock("@/lib/auth/staffTier",()=>({fetchStaffTier:mocks.tier}));
vi.mock("@/lib/cards/seasonsEnd/queries",()=>({fetchSeasonsEnd:mocks.fetch}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.redirect.mockImplementation(()=>{throw new Error("redirect")});mocks.fetch.mockResolvedValue({options:[],season:null,result:null});});
describe("season preview server gate",()=>{
 it.each([{isAdmin:false,isOwner:false,isBroadcaster:false},{isAdmin:false,isOwner:false,isBroadcaster:true}])("rejects non-admin access before reading stats (%j)",async tier=>{mocks.tier.mockResolvedValue(tier);await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow("redirect");expect(mocks.fetch).not.toHaveBeenCalled();});
 it.each([{isAdmin:true,isOwner:false},{isAdmin:false,isOwner:true}])("allows admin/owner and forwards the league scope",async tier=>{mocks.tier.mockResolvedValue(tier);render(await Page({searchParams:Promise.resolve({league:"academy",season:"A1"})}));expect(mocks.fetch).toHaveBeenCalledWith(mocks.client,"academy","A1");expect(screen.getByText("No seasons with stats are available for this league.")).toBeTruthy();});
 it("shows a visible read failure rather than fabricated cards",async()=>{mocks.tier.mockResolvedValue({isAdmin:true});mocks.fetch.mockRejectedValue(new Error("offline"));render(await Page({searchParams:Promise.resolve({})}));expect(screen.getByRole("alert").textContent).toContain("could not be loaded");});
});
