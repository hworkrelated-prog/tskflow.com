import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Helper function to extract error message from API responses
export function getErrorMessage(error, defaultMessage = 'An error occurred') {
  const errorDetail = error?.response?.data?.detail;
  
  if (typeof errorDetail === 'string') {
    return errorDetail;
  }
  
  if (Array.isArray(errorDetail) && errorDetail.length > 0) {
    // Pydantic validation errors come as array of objects
    return errorDetail[0]?.msg || errorDetail[0]?.message || defaultMessage;
  }
  
  if (errorDetail && typeof errorDetail === 'object') {
    return errorDetail.msg || errorDetail.message || defaultMessage;
  }
  
  return error?.message || defaultMessage;
}
