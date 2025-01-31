import { PPLAContentType, PPLARequest, PPLAField } from "@/types";

export function createDefaultPPLARequest(
    product: {
        name: string;
        code: string;
        price: number;
    },
    config?: {
        width?: number;
        height?: number;
        density?: number;
        gap?: number;
        copies?: number;
    }
): PPLARequest {
    return {
        config: {
            width: config?.width ?? 400,
            height: config?.height ?? 300,
            density: config?.density ?? 8,
            gap: config?.gap ?? 24
        },
        fields: [
            {
                x: 50,
                y: 50,
                content: product.name,
                field_type: PPLAContentType.Text,
                font_size: 2
            },
            {
                x: 50,
                y: 100,
                content: `R$ ${product.price.toFixed(2)}`,
                field_type: PPLAContentType.Text,
                font_size: 2
            },
            {
                x: 50,
                y: 150,
                content: product.code,
                field_type: PPLAContentType.Barcode
            }
        ],
        copies: config?.copies ?? 1
    };
}

export function createPPLAFromTemplate(
    template: {
        width: number;
        height: number;
        density: number;
        fields: string;
    },
    product: {
        name: string;
        code: string;
        price: number;
    },
    copies: number = 1
): PPLARequest {
    const fields = JSON.parse(template.fields).map((field: any) => ({
        ...field,
        content: field.field === 'product_name' ? product.name :
                field.field === 'product_code' ? product.code :
                field.field === 'price' ? `R$ ${product.price.toFixed(2)}` :
                field.content
    }));

    return {
        config: {
            width: template.width,
            height: template.height,
            density: template.density,
            gap: 24
        },
        fields,
        copies
    };
}