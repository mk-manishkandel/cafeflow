import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import logger from '../utils/logger';
import {
  getMenu, addMenuItem, updateMenuItem, deleteMenuItem,
  getCategories, addCategory, deleteCategory, API_BASE,
  getBranches, Branch, updateTodayMenuSelection, authenticatedFetch
} from '../services/storageService';
import { MenuItem, Category } from '../types';
import { generateMenuItemDetails } from '../services/geminiService';
import { LayoutGrid, Plus, Upload } from 'lucide-react';
import { useBranch } from '../contexts/BranchContext';
import { usePermission } from '../hooks/usePermission';

import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import { useUI } from './ui/UIContext';

// Extracted Components
import { MenuTable } from './Managers/Tables/MenuTable';
import { MenuModal } from './Managers/Modals/MenuModal';
import { MenuImportModal } from './Managers/Modals/MenuImportModal';
import { MenuBulkActions } from './Managers/BulkActions/MenuBulkActions';
import { CategorySidebar } from './Managers/Sidebars/CategorySidebar';
import { SecureActionModal } from './shared/SecureActionModal';
import Pagination from './Pagination';

const MenuManager = () => {
  const { currentBranch } = useBranch();
  const can = usePermission();
  const { showToast } = useUI();

  // Data State
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Bulk State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Delete State
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isCategoryDeleteModalOpen, setIsCategoryDeleteModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [image, setImage] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [available, setAvailable] = useState(true);

  // View State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Branch Map
  const branchMap = useMemo(() => {
    return branches.reduce((acc, branch) => {
      acc[branch.id] = branch.name;
      return acc;
    }, {} as Record<string, string>);
  }, [branches]);

  const isMainBranch = currentBranch?.name === 'Main Branch';

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  // Fetch Data
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const targetBranchId = isMainBranch ? undefined : currentBranch?.id;

      // When showAll is true, omit page/limit to hit the non-paginated server path
      const [menuResult, categoryData, branchData] = await Promise.all([
        showAll
          ? getMenu(targetBranchId, undefined, undefined, searchQuery, sortKey, sortDir, isBackground, true)
          : getMenu(targetBranchId, currentPage, 15, searchQuery, sortKey, sortDir, isBackground, true),
        getCategories(targetBranchId, isBackground),
        getBranches()
      ]);

      if (Array.isArray(menuResult)) {
        setItems(menuResult);
        setTotalPages(1);
        setTotalItems(menuResult.length);
      } else {
        setItems(menuResult.data);
        setTotalPages(menuResult.pagination.totalPages);
        setTotalItems(menuResult.pagination.total);
      }

      setCategories(categoryData);
      setBranches(branchData);
    } catch (err) {
      logger.error("Failed to fetch menu data", err);
      if (!isBackground) showToast('Failed to load menu data', 'error');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [isMainBranch, currentBranch?.id, currentPage, showAll, searchQuery, sortKey, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page on search/sort/branch change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDir, currentBranch?.id]);

  // Real-time updates
  useRealTimeUpdate({
    onUpdate: () => fetchData(true),
    dataTypes: ['menu'],
    branchId: currentBranch?.id,
    debounceMs: 2000,
  });

  // Handlers
  const openModal = (item: MenuItem | null = null) => {
    setEditingItem(item);
    if (item) {
      setName(item.name);
      setPrice(item.price.toString());
      setCategory(item.category);
      setImage(item.image || '/Menu-Logo.png');
      setSelectedBranchId(item.branchId || '');
      setAvailable(item.available !== false);
    } else {
      setName('');
      setPrice('');
      setCategory('');
      setImage('/Menu-Logo.png');
      setSelectedBranchId(currentBranch?.id || '');
      setAvailable(true);
    }
    // Take to top of page as requested
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      showToast('Please select a category', 'error');
      return;
    }
    const itemData: MenuItem = {
      id: editingItem?.id || crypto.randomUUID(),
      name,
      price: parseFloat(price),
      category,
      image,
      branchId: isMainBranch ? selectedBranchId : currentBranch?.id,
      available
    };

    try {
      if (editingItem) {
        await updateMenuItem(itemData);
        showToast('Item updated successfully', 'success');
      } else {
        await addMenuItem(itemData, isMainBranch ? selectedBranchId : currentBranch?.id);
        showToast('Item created successfully', 'success');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (_err) {
      showToast("Failed to save item", 'error');
    }
  };

  const handleDeleteClick = (item: MenuItem) => {
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteMenuItem(itemToDelete.id);
      setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      showToast('Item deleted successfully', 'success');
    } catch (_err) {
      showToast("Delete failed", 'error');
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || isMainBranch) return;
    try {
      const newCat: Category = { id: crypto.randomUUID(), name: newCategoryName.trim() };
      await addCategory({ ...newCat, branchId: currentBranch?.id });
      setCategories(prev => [...prev, newCat]);
      setNewCategoryName('');
    } catch (_err) {
      showToast("Failed to add category", 'error');
    }
  };

  const handleDeleteCategoryClick = (category: Category) => {
    setCategoryToDelete(category);
    setIsCategoryDeleteModalOpen(true);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteCategory(categoryToDelete.id);
      setCategories(prev => prev.filter(c => c.id !== categoryToDelete.id));
      setIsCategoryDeleteModalOpen(false);
      setCategoryToDelete(null);
      showToast('Category deleted successfully', 'success');
    } catch (_err) {
      showToast("Delete failed", 'error');
    }
  };

  const handleAI = async () => {
    if (!name) return;
    setIsGenerating(true);
    try {
      const details = await generateMenuItemDetails(name);
      if (details.category) setCategory(details.category);
    } catch (err) {
      logger.error("AI Generation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    setLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id: string) => deleteMenuItem(id)));
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      setIsBulkDeleteModalOpen(false);
      showToast('Selected items deleted successfully', 'success');
    } catch (_err) {
      showToast("Bulk delete failed", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkTodayMenu = async (active: boolean) => {
    setLoading(true);
    try {
      const updatedCount = await updateTodayMenuSelection(Array.from(selectedIds) as string[], active);
      if (updatedCount === 0) {
        showToast("No items were updated. You may not have permission for these items.", 'error');
        return;
      }
      setItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, isTodayMenu: active } : i));
      setSelectedIds(new Set());
      showToast(`Updated today's menu selection`, 'success');
    } catch (_err) {
      showToast("Failed to update today's menu", 'error');
    } finally {
      setLoading(false);
    }
  };


  const downloadTemplate = () => {
    let headers = 'name,price,category,image';
    let rows: string[] = [];
    if (isMainBranch) {
      headers += ',branch';
      const vBranches = branches.filter(b => b.name !== 'Main Branch');
      rows = vBranches.map((b, i) => `Example Item ${i + 1},100,Snacks,,${b.name}`);
    } else {
      rows = ['Club Sandwich,150,Snacks,', 'Cappuccino,80,Beverages,'];
    }
    const csvContent = `${headers}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());

      if (lines.length === 0) {
        showToast("The uploaded file is empty.", 'error');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['name', 'price', 'category', 'image'];
      if (isMainBranch) requiredHeaders.push('branch');

      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        showToast(`Invalid CSV format. Missing columns: ${missingHeaders.join(', ')}.\nPlease download the template to ensure correct format.`, 'error');
        return;
      }

      const branchIdx = headers.indexOf('branch');
      const menuList = lines.slice(1).map((line, _idx) => {
        const values = line.split(',').map(v => v.trim());
        if (values.length <= 1 && !values[0]) return null;

        // Basic row validation
        const nameIdx = headers.indexOf('name');
        const name = values[nameIdx];
        if (!name) return null; // Skip rows without name

        return {
          name: name,
          price: parseFloat(values[headers.indexOf('price')]) || 0,
          category: values[headers.indexOf('category')] || '',
          image: values[headers.indexOf('image')] || '',
          branch: branchIdx !== -1 ? values[branchIdx] : undefined,
        };
      }).filter(Boolean);

      if (menuList.length === 0) {
        showToast("No valid menu items found in the file. Please check your data.", 'error');
        return;
      }

      const response = await authenticatedFetch(`${API_BASE}/menu/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuList, branchId: currentBranch?.id })
      });

      if (response.ok) {
        showToast('Import Successful', 'success');
        fetchData();
      } else {
        let errMsg = 'Unknown error';
        try { const res = await response.json(); errMsg = res.error || errMsg; } catch (_) {}
        showToast('Import Failed: ' + errMsg, 'error');
      }
    } catch (_err) {
      showToast('Import failed: Invalid file or data.', 'error');
    } finally {
      setIsImporting(false);
      setIsImportModalOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Menu Management"
        subtitle="Manage your restaurant's menu items and categories."
        icon={LayoutGrid}
        actions={[
          { label: "Import CSV", icon: Upload, onClick: () => setIsImportModalOpen(true), variant: 'secondary', hidden: !can('MENU_BULK_IMPORT') },
          { label: "Add Item", icon: Plus, onClick: () => openModal(), variant: 'primary', hidden: !can('MENU_ADD_ITEM') }
        ]}
      >
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search menu items..." />
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <CategorySidebar
          categories={categories}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          onAddCategory={handleCategorySubmit}
          onDeleteCategory={handleDeleteCategoryClick}
          canManage={can('MENU_MANAGE_CATEGORIES') && !isMainBranch}
          isMainBranch={isMainBranch}
          branchMap={branchMap}
        />

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          <MenuBulkActions
            selectedCount={selectedIds.size}
            onClearSelection={() => setSelectedIds(new Set())}
            onBulkDelete={handleBulkDeleteClick}
            onBulkTodayMenu={handleBulkTodayMenu}
            canEdit={can('MENU_EDIT_ITEM')}
          />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <MenuTable
              loading={loading}
              items={items}
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
              onToggleSelectAll={() => setSelectedIds(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)))}
              onSort={handleSort} sortKey={sortKey} sortDir={sortDir}
              isMainBranch={isMainBranch}
              branchMap={branchMap}
              onEdit={openModal}
              onDelete={handleDeleteClick}
              canEdit={can('MENU_EDIT_ITEM')}
              canDelete={can('MENU_DELETE_ITEM')}
            />
          </div>

          <Pagination
            currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
            itemsPerPage={showAll ? totalItems : 15} totalItems={totalItems}
            onShowAll={() => { setShowAll(prev => !prev); setCurrentPage(1); }}
            isShowingAll={showAll}
          />
        </div>
      </div>

      <MenuModal
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit}
        editingItem={editingItem} name={name} setName={setName} price={price} setPrice={setPrice}
        category={category} setCategory={setCategory} image={image} setImage={setImage}
        categories={categories} isMainBranch={isMainBranch} branches={branches}
        selectedBranchId={selectedBranchId} setSelectedBranchId={setSelectedBranchId}
        onAI={handleAI} isGenerating={isGenerating}
        available={available} setAvailable={setAvailable}
      />
      <MenuImportModal
        isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)}
        onDownloadTemplate={downloadTemplate} onUploadClick={() => fileInputRef.current?.click()}
        isImporting={isImporting} isMainBranch={isMainBranch}
      />
      <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
      <SecureActionModal
        isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete}
        title="Archive Menu Item"
        description="Archiving this item will remove it from the active menu but preserve its historical sales data for reporting. This action is reversible."
        itemName={itemToDelete?.name || ''}
        confirmKeyword="DELETE" confirmButtonText="Archive" variant="danger"
      />
      <SecureActionModal
        isOpen={isBulkDeleteModalOpen} onClose={() => setIsBulkDeleteModalOpen(false)} onConfirm={handleConfirmBulkDelete}
        title="Delete Multiple Items" description="This will permanently delete the selected menu items. This action cannot be undone."
        itemName={`${selectedIds.size} items selected`} confirmKeyword="DELETE" confirmButtonText="Delete" variant="danger"
      />
      <SecureActionModal
        isOpen={isCategoryDeleteModalOpen} onClose={() => setIsCategoryDeleteModalOpen(false)} onConfirm={handleConfirmDeleteCategory}
        title="Delete Category" description="This will permanently delete this category. Menu items in this category will not be affected."
        itemName={categoryToDelete?.name || ''} confirmKeyword="DELETE" confirmButtonText="Delete" variant="danger"
      />
    </div>
  );
};

export default MenuManager;