import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getValidErrorMessage(submitError: unknown) {
    const message =
        submitError instanceof Error ? submitError.message : "Unable to log in";

    try {
        const passedError = JSON.parse(message);

        if (passedError.detail) {
            return passedError.detail;
        } else return message;
    } catch {
        return message;
    }
}
