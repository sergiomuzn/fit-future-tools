import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Inicia sesión con el usuario de prueba del rol indicado (solo preview). */
export const devSignInAs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ role: z.enum(["admin", "cliente"]) }).parse(d))
  .handler(async ({ data }) => {
    const { devSignIn, isPreviewHost } = await import("./dev-auth.server");
    if (!isPreviewHost()) throw new Error("No disponible");
    return devSignIn(data.role);
  });
