import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, CartItem } from '../../../shared/types';

const CART_STORAGE_KEY = '@rides_cart';

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (cartKey: string) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalItems: 0,
  totalPrice: 0,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const getCartKey = useCallback(
    (product: Product) => `${product.id}::${product.selected_pack_option_id || 'default'}`,
    []
  );

  // Load cart from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(CART_STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            const normalized = parsed.map((item) => ({
              ...item,
              cart_key: item.cart_key || `${item?.product?.id || 'unknown'}::${item?.product?.selected_pack_option_id || 'default'}`,
            }));
            setItems(normalized);
          }
        } catch {}
      }
    });
  }, []);

  // Persist cart to storage
  const persist = useCallback((newItems: CartItem[]) => {
    setItems(newItems);
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newItems));
  }, []);

  const addItem = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const cartKey = getCartKey(product);
      const existing = prev.find((i) => i.cart_key === cartKey);
      let next: CartItem[];
      if (existing) {
        next = prev.map((i) =>
          i.cart_key === cartKey
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      } else {
        next = [...prev, { cart_key: cartKey, product, quantity }];
      }
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [getCartKey]);

  const removeItem = useCallback((cartKey: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.cart_key !== cartKey);
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateQuantity = useCallback((cartKey: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartKey);
      return;
    }
    setItems((prev) => {
      const next = prev.map((i) =>
        i.cart_key === cartKey ? { ...i, quantity } : i
      );
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [removeItem]);

  const clearCart = useCallback(() => {
    persist([]);
  }, [persist]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
