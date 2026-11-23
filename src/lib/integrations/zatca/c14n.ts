import { DOMParser, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;
const XMLNS = "http://www.w3.org/2000/xmlns/";

const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const serialize = (element: XmlElement, inherited: Map<string, string>): string => {
  const scope = new Map(inherited);
  const namespaces: Array<[string, string]> = [];
  const attributes: Array<{ sortKey: string; name: string; value: string }> = [];
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attribute = element.attributes.item(i);
    if (!attribute) continue;
    if (attribute.namespaceURI === XMLNS || attribute.name === "xmlns") {
      const prefix = attribute.name === "xmlns" ? "" : attribute.name.slice("xmlns:".length);
      if (scope.get(prefix) !== attribute.value) {
        scope.set(prefix, attribute.value);
        namespaces.push([prefix, attribute.value]);
      }
    } else {
      attributes.push({
        sortKey: `${attribute.namespaceURI ?? ""}\u0000${attribute.localName ?? attribute.name}`,
        name: attribute.name,
        value: attribute.value,
      });
    }
  }
  namespaces.sort((a, b) => compare(a[0], b[0]));
  attributes.sort((a, b) => compare(a.sortKey, b.sortKey));

  let output = `<${element.tagName}`;
  for (const [prefix, uri] of namespaces) {
    output += ` ${prefix ? `xmlns:${prefix}` : "xmlns"}="${escapeAttribute(uri)}"`;
  }
  for (const attribute of attributes) {
    output += ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
  }
  output += ">";
  for (let child: XmlNode | null = element.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === ELEMENT_NODE) output += serialize(child as XmlElement, scope);
    else if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE) {
      output += escapeText(child.nodeValue ?? "");
    }
  }
  return `${output}</${element.tagName}>`;
};

/**
 * Canonical XML 1.1 without comments, for a whole document. `exclude` drops
 * elements first, as ZATCA's XPath transforms do; the whitespace around a
 * dropped element stays, because the standard keeps it.
 */
export const canonicalize = (xml: string, exclude: (element: XmlElement) => boolean = () => false) => {
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(`XML is not well formed: ${message}`);
    },
  }).parseFromString(xml, "text/xml");
  const root = document.documentElement;
  if (!root) throw new Error("XML has no root element.");
  const prune = (element: XmlElement) => {
    for (let child = element.firstChild; child; ) {
      const next: XmlNode | null = child.nextSibling;
      if (child.nodeType === ELEMENT_NODE) {
        if (exclude(child as XmlElement)) element.removeChild(child);
        else prune(child as XmlElement);
      }
      child = next;
    }
  };
  prune(root);
  return serialize(root, new Map());
};
