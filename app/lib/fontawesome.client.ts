import { createElement } from "react";
import { library } from "@fortawesome/fontawesome-svg-core";
import {
  faBan,
  faCheck,
  faEye,
  faPen,
  faPlus,
  faRefresh,
  faTrash,
  faUserSecret,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { ComponentProps } from "react";

library.add(
  faBan,
  faCheck,
  faEye,
  faPen,
  faPlus,
  faRefresh,
  faTrash,
  faUserSecret,
);

const ICONS: Record<string, IconDefinition> = {
  ban: faBan,
  check: faCheck,
  eye: faEye,
  pen: faPen,
  plus: faPlus,
  refresh: faRefresh,
  trash: faTrash,
  userSecret: faUserSecret,
};

type IconProps = { name: keyof typeof ICONS } & Omit<
  ComponentProps<typeof FontAwesomeIcon>,
  "icon"
>;

export function Icon({ name, ...props }: IconProps) {
  return createElement(FontAwesomeIcon, { icon: ICONS[name], ...props });
}
