import React, { memo, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { FixedSizeGrid, GridChildComponentProps } from 'react-window';
import { Search } from 'lucide-react';
import { MenuItem } from '../../types';
import Skeleton from '../Skeleton';
import { MenuItemCard } from './MenuItemCard';

// Card geometry mirrors MenuItemCard's rendered height: h-24 image (96px) +
// mb-2 (8px) + two text lines ~20px each + price line ~20px + p-3 padding (24px)
const CARD_HEIGHT = 188;
const GAP = 16;
const MIN_CARD_WIDTH = 200;
const OVERSCAN_ROW_COUNT = 6;

interface GridCellData {
    items: MenuItem[];
    columnCount: number;
    cardWidth: number;
    cardHeight: number;
    cartMap: Map<string, number>;
    onAddToCart: (item: MenuItem) => void;
}

const GridCell = ({
    columnIndex,
    rowIndex,
    style,
    data
}: GridChildComponentProps<GridCellData>) => {
    const index = rowIndex * data.columnCount + columnIndex;
    if (index >= data.items.length) return null;

    const item = data.items[index];

    return (
        <div
            style={{
                ...style,
                width: data.cardWidth,
                height: data.cardHeight,
                padding: 0
            }}
            role="listitem"
        >
            <MenuItemCard
                item={item}
                quantity={data.cartMap.get(item.id)}
                onAdd={() => data.onAddToCart(item)}
            />
        </div>
    );
};

interface POSMenuGridProps {
    loading: boolean;
    filteredMenu: MenuItem[];
    cartMap: Map<string, number>;
    onAddToCart: (item: MenuItem) => void;
}

export const POSMenuGrid = memo(({
    loading,
    filteredMenu,
    cartMap,
    onAddToCart
}: POSMenuGridProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0) {
                    setContainerWidth(prev => (Math.abs(prev - width) > 1 ? width : prev));
                }
                if (height > 0) {
                    setContainerHeight(prev => (Math.abs(prev - height) > 1 ? height : prev));
                }
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Column count derived from a minimum card width so cards never shrink
    // below a usable tap target on narrow terminals. Always at least 2 so
    // phone-width screens don't fall back to a single column per row.
    const columnCount = Math.max(2, Math.floor((containerWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
    const cardWidth = Math.max(
        1,
        Math.floor((containerWidth - GAP * (columnCount - 1)) / columnCount)
    );
    const rowCount = Math.ceil(filteredMenu.length / columnCount);

    const cellData = useMemo<GridCellData>(() => ({
        items: filteredMenu,
        columnCount,
        cardWidth,
        cardHeight: CARD_HEIGHT,
        cartMap,
        onAddToCart
    }), [filteredMenu, columnCount, cardWidth, cartMap, onAddToCart]);

    return (
        <div
            ref={containerRef}
            className="flex-1 min-h-0 p-4 pb-32 lg:pb-4 overflow-hidden"
            role="list"
            aria-label="Menu items"
        >
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
                    {[...Array(12)].map((_, i) => (
                        <div key={i} className="group bg-white border border-slate-100 rounded-xl p-3 flex flex-col min-h-[188px]">
                            <Skeleton width="100%" height={96} className="mb-2 rounded-t-lg" />
                            <Skeleton width="80%" height={16} className="mb-2" />
                            <Skeleton width="60%" height={16} className="mb-2" />
                            <Skeleton width="40%" height={16} />
                        </div>
                    ))}
                </div>
            ) : filteredMenu.length > 0 && containerWidth > 0 && containerHeight > 0 ? (
                <FixedSizeGrid<GridCellData>
                    columnCount={columnCount}
                    columnWidth={cardWidth + GAP}
                    rowCount={rowCount}
                    rowHeight={CARD_HEIGHT + GAP}
                    height={containerHeight}
                    width={containerWidth}
                    itemData={cellData}
                    overscanRowsCount={OVERSCAN_ROW_COUNT}
                    overscanColumnsCount={0}
                    className="scrollbar-hide"
                    style={{ overflowX: 'hidden' }}
                >
                    {GridCell}
                </FixedSizeGrid>
            ) : filteredMenu.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
                    <Search size={48} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium">No items found</p>
                    <p className="text-sm">Try adjusting your search or filters</p>
                </div>
            ) : null}
        </div>
    );
});

POSMenuGrid.displayName = 'POSMenuGrid';
