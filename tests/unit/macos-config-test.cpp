#include "server/backend.hpp"
#include "server/config.hpp"
#include <membership.h>
#include <sys/acl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <uuid/uuid.h>
#include <cassert>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <initializer_list>
#include <stdexcept>
#include <string>
#include <vector>

namespace relay {
const Backend& defaultBackend() {
  static const Backend backend{"test", nullptr, nullptr, nullptr};
  return backend;
}
const Backend& backendFor(const std::string&) { return defaultBackend(); }
std::string backendNames() { return "test"; }
}

namespace {
struct Ace {
  acl_tag_t tag;
  uuid_t subject;
};

Ace userAce(acl_tag_t tag, uid_t user) {
  Ace ace{};
  ace.tag = tag;
  assert(mbr_uid_to_uuid(user, ace.subject) == 0);
  return ace;
}

Ace groupAce(acl_tag_t tag) {
  Ace ace{};
  ace.tag = tag;
  assert(mbr_gid_to_uuid(getegid(), ace.subject) == 0);
  return ace;
}

Ace unknownAce(acl_tag_t tag) {
  Ace ace{};
  ace.tag = tag;
  uuid_generate(ace.subject);
  return ace;
}

bool acceptsToken(const std::filesystem::path& viewer, const std::filesystem::path& token) {
  std::vector<std::string> args{"relay-engine", "--viewer-dir", viewer.string(), "--token-file", token.string()};
  std::vector<char*> argv;
  for (auto& arg : args) argv.push_back(arg.data());
  relay::Config config;
  try { return relay::parseConfig(int(argv.size()), argv.data(), config); }
  catch (const std::runtime_error&) { return false; }
}

/// Replaces the file's extended ACL and checks that it holds exactly these entries in this order.
void setAcl(const std::filesystem::path& file, std::initializer_list<Ace> entries) {
  acl_t acl = acl_init(int(entries.size()));
  assert(acl);
  for (const auto& ace : entries) {
    acl_entry_t entry;
    acl_permset_t perms;
    assert(acl_create_entry_np(&acl, &entry, ACL_LAST_ENTRY) == 0);
    assert(acl_set_tag_type(entry, ace.tag) == 0);
    assert(acl_set_qualifier(entry, ace.subject) == 0);
    assert(acl_get_permset(entry, &perms) == 0);
    assert(acl_add_perm(perms, ace.tag == ACL_EXTENDED_DENY ? ACL_WRITE_DATA : ACL_READ_DATA) == 0);
  }
  assert(acl_set_file(file.c_str(), ACL_TYPE_EXTENDED, acl) == 0);
  assert(acl_free(acl) == 0);
  acl = acl_get_file(file.c_str(), ACL_TYPE_EXTENDED);
  assert(acl);
  int index = ACL_FIRST_ENTRY;
  for (const auto& ace : entries) {
    acl_entry_t entry;
    acl_permset_t perms;
    acl_tag_t tag;
    assert(acl_get_entry(acl, index, &entry) == 0 && acl_get_tag_type(entry, &tag) == 0 && tag == ace.tag);
    void* qualifier = acl_get_qualifier(entry);
    assert(qualifier && uuid_compare(*static_cast<uuid_t*>(qualifier), ace.subject) == 0);
    assert(acl_free(qualifier) == 0);
    assert(acl_get_permset(entry, &perms) == 0);
    assert(acl_get_perm_np(perms, ace.tag == ACL_EXTENDED_DENY ? ACL_WRITE_DATA : ACL_READ_DATA) == 1);
    index = ACL_NEXT_ENTRY;
  }
  assert(acl_free(acl) == 0);
}
}

int main() {
  std::string name = (std::filesystem::temp_directory_path() / "relay-acl-test-XXXXXX").string();
  assert(mkdtemp(name.data()));
  const std::filesystem::path directory{name};
  const auto viewer = directory / "viewer";
  const auto token = directory / "token";
  std::filesystem::create_directory(viewer);
  std::ofstream(viewer / "index.html");
  std::ofstream(viewer / "viewer.js");
  { std::ofstream output(token); output << std::string(64, 'a'); }
  assert(chmod(token.c_str(), 0600) == 0);
  const uid_t owner = geteuid();
  const uid_t other = owner == 0 ? 501 : 0;

  assert(acceptsToken(viewer, token));

  assert(chmod(token.c_str(), 0640) == 0);
  assert(!acceptsToken(viewer, token));
  assert(chmod(token.c_str(), 0600) == 0);
  assert(acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_DENY, owner)});
  assert(acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_ALLOW, owner)});
  assert(acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_DENY, owner), userAce(ACL_EXTENDED_ALLOW, owner)});
  assert(acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_DENY, other)});
  assert(acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_ALLOW, other)});
  assert(!acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_ALLOW, other), userAce(ACL_EXTENDED_ALLOW, owner)});
  assert(!acceptsToken(viewer, token));

  setAcl(token, {userAce(ACL_EXTENDED_ALLOW, owner), userAce(ACL_EXTENDED_ALLOW, other)});
  assert(!acceptsToken(viewer, token));

  setAcl(token, {groupAce(ACL_EXTENDED_DENY)});
  assert(acceptsToken(viewer, token));

  setAcl(token, {groupAce(ACL_EXTENDED_ALLOW)});
  assert(!acceptsToken(viewer, token));

  setAcl(token, {unknownAce(ACL_EXTENDED_DENY)});
  assert(acceptsToken(viewer, token));

  setAcl(token, {unknownAce(ACL_EXTENDED_ALLOW)});
  assert(!acceptsToken(viewer, token));

  std::filesystem::remove_all(directory);
}
