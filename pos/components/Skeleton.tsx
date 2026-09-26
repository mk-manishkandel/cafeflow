import React from 'react';
import clsx from 'clsx';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    circle?: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({ className, width, height, circle }) => {
    const style = {
        width,
        height,
    };

    return (
        <div
            className={clsx(
                "animate-pulse bg-slate-200 shimmer",
                circle ? "rounded-full" : "rounded-lg",
                className
            )}
            style={style}
        />
    );
};

export default Skeleton;
