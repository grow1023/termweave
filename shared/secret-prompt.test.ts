import { expect, it } from "bun:test";
import { mayAskForSecret, PREVIOUS_WIDTHS, rememberWidth, secretPrompt, validSecret } from "./secret-prompt.ts";

it("recognizes only a short secret request on the last nonempty line", () => {
  for (const prompt of ["[sudo] password for alice:", "alice@server's password:", "Password:", "Password for alice:", "Enter passphrase:", "Enter passphrase for key '/tmp/key':", "Enter PIN:", "Enter PIN for token:", "Repeat password:", "Verify password:", "Confirm password:"]) {
    expect(secretPrompt(`previous output\r\n ${prompt} \r\n\n`)).toBe(prompt);
  }
  for (const screen of ["", "Password?", "Password: y/n", "Enter PIN for y/n:", "Please enter your password:", "Example: Password:", "Password:\n$ ", `Password for ${"x".repeat(120)}:`]) {
    expect(secretPrompt(screen)).toBeNull();
  }
});

it("rejects multiline and terminal-control secrets while preserving spaces and Unicode", () => {
  expect(validSecret("  한글🔒  ")).toBe(true);
  for (const value of [null, "", "x".repeat(4097), "one\ntwo", "one\rtwo", "\u001b[200~", "\u0003", "\u007f", "\u009b"]) expect(validSecret(value)).toBe(false);
});

it("joins only right-edge continuations of a narrow prompt", () => {
  expect(secretPrompt("Enter passphrase for key '/tmp/my private key for testing\n':\n", 57)).toBe("Enter passphrase for key '/tmp/my private key for testing':");
  expect(secretPrompt("Enter passphrase for key\n'/tmp/key':", "Enter passphrase for key ".length)).toBe("Enter passphrase for key '/tmp/key':");
  expect(secretPrompt("Enter passphrase for key\n '/tmp/key':", "Enter passphrase for key".length)).toBe("Enter passphrase for key '/tmp/key':");
  expect(secretPrompt("Enter passphrase for key\n'/tmp/key':", 80)).toBeNull();
  expect(secretPrompt("This is prose that ends\nPassword?", 24)).toBeNull();
});

// an invented prompt, wrapped on a 47-column phone and then shown on a wider desktop pane: the
// row break stays where the old width put it, so only the old width shows it was a wrap
const wrappedOnPhone = "Enter passphrase for key '/tmp/my private key f\nor testing':\n";

it("still sees a prompt wrapped at an earlier, narrower width", () => {
  expect(secretPrompt(wrappedOnPhone, 150)).toBeNull();
  expect(secretPrompt(wrappedOnPhone, [150, 47])).toBe("Enter passphrase for key '/tmp/my private key for testing':");
  expect(secretPrompt(wrappedOnPhone, [47, 150])).toBe("Enter passphrase for key '/tmp/my private key for testing':");
  // an old width joins only a row that ended at that edge, never prose of another length
  expect(secretPrompt("Enter passphrase for key\n'/tmp/key':", [150, 47])).toBeNull();
  expect(secretPrompt("This is prose that ends\nPassword?", [150, 24])).toBeNull();
});

it("remembers the widths before a resize, newest first, without the current one", () => {
  expect(rememberWidth([], 47, 150)).toEqual([47]);
  expect(rememberWidth([47], 150, 80)).toEqual([150, 47]);
  // a width seen again moves to the front instead of repeating
  expect(rememberWidth([80, 47], 47, 120)).toEqual([47, 80]);
  // going back to an old width drops it from the past: it is the current one again
  expect(rememberWidth([150, 47], 80, 47)).toEqual([80, 150]);
  // a resize to the same width changes nothing
  expect(rememberWidth([47], 80, 80)).toEqual([47]);
  expect(rememberWidth([1, 2, 3], 4, 5)).toHaveLength(PREVIOUS_WIDTHS);
  expect(rememberWidth([1, 2, 3], 4, 5)).toEqual([4, 1, 2]);
});

it("finds a prompt wrapped before a resize only with the remembered width, and never without a prompt", () => {
  // phone (47) -> desktop (150): the server checks [150, ...previous]
  const previous = rememberWidth([], 47, 150);
  expect(secretPrompt(wrappedOnPhone, [150, ...previous])).toBe("Enter passphrase for key '/tmp/my private key for testing':");
  expect(secretPrompt(wrappedOnPhone, 150)).toBeNull();
  // still strict: no prompt on screen, no match, whatever widths are remembered
  for (const screen of ["", "$ ls\n", "The password is kept in the vault\nso nobody types it:", "This is prose that ends\nPassword?"]) {
    expect(secretPrompt(screen, [150, ...rememberWidth([80, 24], 47, 150)])).toBeNull();
  }
});

it("suspects a secret prompt on loose grounds, wrapped or not", () => {
  for (const screen of [wrappedOnPhone, "Password:", "$ ssh host\nalice@host's password: ", "[sudo] password for alice:", "Enter PIN for token:", "Enter passphrase for key\n'/tmp/key':\n\n", "Please enter your password:"]) {
    expect(mayAskForSecret(screen)).toBe(true);
  }
  for (const screen of ["", "$ ", "Password:\n$ ", "password reset sent\n$ ", "spinning:", "Enter passphrase for key '/tmp/k':\nAccepted\nReady>"]) {
    expect(mayAskForSecret(screen)).toBe(false);
  }
});
