import os, re

# All files in Index.html include order (before Branches)
before_branches = ['Dashboard.html', 'Orders.html']
all_tabs = ['Dashboard.html', 'Orders.html', 'Branches.html', 'Departments.html',
            'LabServices.html', 'Packages.html', 'Discounts.html', 'Doctors.html',
            'Patients.html', 'MedTechs.html', 'Admins.html', 'BranchAdminChangePassword.html']

def get_ids(fname):
    content = open(fname, encoding='utf-8').read()
    return re.findall(r'id="([\w-]+)"', content)

# Check for any duplicate IDs across ALL tab files
id_to_files = {}
for fname in all_tabs:
    if not os.path.exists(fname):
        continue
    ids = get_ids(fname)
    for id_ in ids:
        if id_ not in id_to_files:
            id_to_files[id_] = []
        id_to_files[id_].append(fname)

print("=== DUPLICATE IDs across tab files ===")
found = False
for id_, files in sorted(id_to_files.items()):
    if len(files) > 1:
        print(f"  '{id_}' appears in: {files}")
        found = True
if not found:
    print("  None found.")
