import Swal from "sweetalert2";

export async function confirmDelete(label = "this item") {
  const result = await Swal.fire({
    title: "Delete?",
    text: `Remove ${label}? This cannot be undone.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Delete",
    confirmButtonColor: "#dc2626",
  });
  return result.isConfirmed;
}

export async function confirmToggleStatus(active: boolean, label = "item") {
  const result = await Swal.fire({
    title: active ? "Deactivate?" : "Activate?",
    text: `${active ? "Disable" : "Enable"} ${label}?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: active ? "Deactivate" : "Activate",
  });
  return result.isConfirmed;
}

export function toastSuccess(message: string) {
  return Swal.fire({ toast: true, position: "top-end", icon: "success", title: message, showConfirmButton: false, timer: 2500 });
}

export function toastError(message: string) {
  return Swal.fire({ toast: true, position: "top-end", icon: "error", title: message, showConfirmButton: false, timer: 3500 });
}
