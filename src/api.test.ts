import { describe, it, expect, spyOn } from "bun:test";
import {
  getConfig,
  fetchBCOrder,
  fetchB2BOrder,
  fetchInvoicesForCompany,
  createInvoice,
  V2_BASE,
  B2B_BASE,
  B2B_INVOICE_BASE,
} from "./api.ts";
import type { Config } from "./api.ts";
import type { CreateInvoicePayload } from "./types.ts";

const config: Config = {
  storeHash: "teststorehash",
  authToken: "testauthtoken",
};

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

// --- getConfig ---

describe("getConfig", () => {
  it("throws when BC_STORE_HASH is missing", () => {
    const origHash = process.env["BC_STORE_HASH"];
    const origToken = process.env["BC_AUTH_TOKEN"];
    delete process.env["BC_STORE_HASH"];
    process.env["BC_AUTH_TOKEN"] = "token";
    try {
      expect(() => getConfig()).toThrow("BC_STORE_HASH");
    } finally {
      if (origHash !== undefined) process.env["BC_STORE_HASH"] = origHash;
      else delete process.env["BC_STORE_HASH"];
      if (origToken !== undefined) process.env["BC_AUTH_TOKEN"] = origToken;
      else delete process.env["BC_AUTH_TOKEN"];
    }
  });

  it("throws when BC_AUTH_TOKEN is missing", () => {
    const origHash = process.env["BC_STORE_HASH"];
    const origToken = process.env["BC_AUTH_TOKEN"];
    process.env["BC_STORE_HASH"] = "hash";
    delete process.env["BC_AUTH_TOKEN"];
    try {
      expect(() => getConfig()).toThrow("BC_AUTH_TOKEN");
    } finally {
      if (origHash !== undefined) process.env["BC_STORE_HASH"] = origHash;
      else delete process.env["BC_STORE_HASH"];
      if (origToken !== undefined) process.env["BC_AUTH_TOKEN"] = origToken;
      else delete process.env["BC_AUTH_TOKEN"];
    }
  });
});

// --- fetchBCOrder ---

describe("fetchBCOrder", () => {
  it("calls the correct v2 URL with proper headers", async () => {
    const orderData = { id: 101, total_inc_tax: "566.50" };
    const spy = mockFetchResponse(orderData);

    await fetchBCOrder(101, config);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${V2_BASE(config.storeHash)}/orders/101`,
    );
    expect((opts.headers as Record<string, string>)["X-Auth-Token"]).toBe(
      "testauthtoken",
    );
    spy.mockRestore();
  });

  it("throws on non-OK response", async () => {
    const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 404, data: { errMsg: "Not found" } }),
        { status: 404 },
      ),
    );

    await expect(fetchBCOrder(999, config)).rejects.toThrow("HTTP 404");
    spy.mockRestore();
  });
});

// --- fetchB2BOrder ---

describe("fetchB2BOrder", () => {
  it("calls the correct B2B URL with store hash header", async () => {
    const b2bData = {
      code: 200,
      data: { id: 50, companyId: 123 },
      meta: { message: "Success" },
    };
    const spy = mockFetchResponse(b2bData);

    await fetchB2BOrder(101, config);

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${B2B_BASE}/orders/101`);
    expect((opts.headers as Record<string, string>)["X-Store-Hash"]).toBe(
      "teststorehash",
    );
    spy.mockRestore();
  });

  it("handles data as an object", async () => {
    const b2bData = {
      code: 200,
      data: { id: 50, companyId: 123 },
      meta: { message: "Success" },
    };
    const spy = mockFetchResponse(b2bData);

    const result = await fetchB2BOrder(101, config);
    expect(result.companyId).toBe(123);
    spy.mockRestore();
  });

  it("handles data as an array", async () => {
    const b2bData = {
      code: 200,
      data: [{ id: 50, companyId: 456 }],
      meta: { message: "Success" },
    };
    const spy = mockFetchResponse(b2bData);

    const result = await fetchB2BOrder(101, config);
    expect(result.companyId).toBe(456);
    spy.mockRestore();
  });

  it("throws when data is empty array", async () => {
    const b2bData = {
      code: 200,
      data: [],
      meta: { message: "Success" },
    };
    const spy = mockFetchResponse(b2bData);

    await expect(fetchB2BOrder(101, config)).rejects.toThrow(
      "No B2B order data",
    );
    spy.mockRestore();
  });
});

// --- fetchInvoicesForCompany ---

describe("fetchInvoicesForCompany", () => {
  it("calls the correct invoice list URL with companyId", async () => {
    const listData = {
      code: 200,
      data: [{ id: 1, invoiceNumber: "INV-101-001" }],
      meta: { message: "Success" },
    };
    const spy = mockFetchResponse(listData);

    await fetchInvoicesForCompany(11702148, config);

    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${B2B_INVOICE_BASE}/invoices?customerId=11702148`);
    expect((opts.headers as Record<string, string>)["X-Store-Hash"]).toBe(
      "teststorehash",
    );
    spy.mockRestore();
  });

  it("returns the data array from the response", async () => {
    const invoices = [
      { id: 1, invoiceNumber: "INV-101-001" },
      { id: 2, invoiceNumber: "INV-101-002" },
    ];
    const spy = mockFetchResponse({
      code: 200,
      data: invoices,
      meta: { message: "Success" },
    });

    const result = await fetchInvoicesForCompany(11702148, config);
    expect(result).toHaveLength(2);
    expect(result[0].invoiceNumber).toBe("INV-101-001");
    spy.mockRestore();
  });

  it("throws on non-OK response", async () => {
    const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 404, data: { errMsg: "Not found" } }),
        { status: 404 },
      ),
    );

    await expect(fetchInvoicesForCompany(999, config)).rejects.toThrow(
      "HTTP 404",
    );
    spy.mockRestore();
  });
});

// --- createInvoice ---

describe("createInvoice", () => {
  it("sends POST with JSON body to the invoice URL", async () => {
    const responseData = {
      code: 200,
      data: { id: 12 },
      meta: { message: "Success" },
    };
    const spy = mockFetchResponse(responseData);

    const payload = {
      invoiceNumber: "INV-101-001",
      type: "Invoice",
      status: 0,
      source: 1,
      orderNumber: "101",
      customerId: "123",
      originalBalance: { code: "USD", value: 283.25 },
      openBalance: { code: "USD", value: 283.25 },
      details: {
        header: {
          costLines: [],
          billingAddress: {
            firstName: "",
            lastName: "",
            street1: "",
            street2: "",
            city: "",
            state: "",
            zipCode: "",
            country: "",
          },
          shippingAddresses: [],
        },
        details: { lineItems: [] },
      },
    } as CreateInvoicePayload;

    const result = await createInvoice(payload, config);

    expect(result.data.id).toBe(12);
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${B2B_INVOICE_BASE}/invoices`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string).invoiceNumber).toBe("INV-101-001");
    spy.mockRestore();
  });

  it("throws on error response with B2B error format", async () => {
    const spy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 400,
          data: { errMsg: "The invoice number already exists." },
          meta: { message: "Bad Requests Error" },
        }),
        { status: 400 },
      ),
    );

    await expect(
      createInvoice(
        { invoiceNumber: "DUPE" } as CreateInvoicePayload,
        config,
      ),
    ).rejects.toThrow("invoice number already exists");
    spy.mockRestore();
  });
});
