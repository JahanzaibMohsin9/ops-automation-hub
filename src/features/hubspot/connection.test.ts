import {
  buildHubSpotContactProperties,
  createHubSpotContact,
  fetchHubSpotAccountDetails,
  findHubSpotContactByEmail,
  updateHubSpotContact,
} from "@/features/hubspot/connection";

describe("HubSpot connection adapter", () => {
  const originalToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;

  beforeEach(() => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "test-hubspot-token";
    vi.restoreAllMocks();
  });

  afterAll(() => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = originalToken;
  });

  it("normalizes lead fields into HubSpot contact properties", () => {
    expect(
      buildHubSpotContactProperties({
        fullName: "Avery Stone",
        email: "avery@example.com",
        phone: "+1 555 0100",
        companyName: "Northstar Ops",
        companyDomain: "northstarops.com",
        jobTitle: "Revenue Operations Lead",
      })
    ).toEqual({
      email: "avery@example.com",
      firstname: "Avery",
      lastname: "Stone",
      phone: "+1 555 0100",
      company: "Northstar Ops",
      website: "https://northstarops.com",
      jobtitle: "Revenue Operations Lead",
    });
  });

  it("uses mocked fetch calls for search, create, update, and account metadata", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ id: "existing-123" }] }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "created-456" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "updated-789" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ portalId: 998877, accountName: "Demo Portal" }),
          { status: 200 }
        )
      );

    await expect(findHubSpotContactByEmail("avery@example.com")).resolves.toEqual({
      id: "existing-123",
    });
    await expect(
      createHubSpotContact({ email: "new@example.com", company: "Acme" })
    ).resolves.toEqual({
      id: "created-456",
    });
    await expect(
      updateHubSpotContact("contact-1", { firstname: "Avery" })
    ).resolves.toEqual({
      id: "updated-789",
    });
    await expect(fetchHubSpotAccountDetails()).resolves.toEqual({
      portalId: 998877,
      accountName: "Demo Portal",
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(URL);
    expect(fetchMock.mock.calls[1]?.[0]).toBeInstanceOf(URL);
  });
});
