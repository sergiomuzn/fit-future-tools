import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Input de contraseña con icono para mostrar/ocultar el texto. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(function PasswordInput({ className, ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        className={className ? `pr-10 ${className}` : "pr-10"}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
